import { z } from "zod";
import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError, badRequest, audit } from "@/lib/hrms/auth";
import { dayIST } from "@/lib/hrms/time";
import { notify } from "@/lib/hrms/attendance";

export const dynamic = "force-dynamic";

const DAY_MODES = ["FULL", "FIRST_HALF", "SECOND_HALF"] as const;

// ── GET: balances + own requests (or substitutes list) ───────
export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;
    const url = new URL(req.url);

    // lightweight coworker list for the substitute picker
    if (url.searchParams.get("action") === "substitutes") {
      const peers = await db.employee.findMany({
        where: {
          companyId: emp.companyId,
          departmentId: emp.departmentId,
          id: { not: emp.id },
          status: { in: ["ACTIVE", "PROBATION"] },
        },
        orderBy: [{ firstName: "asc" }],
        take: 50,
      });
      return ok({
        substitutes: peers.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, designation: p.designation })),
      });
    }

    const year = dayIST(new Date()).getUTCFullYear();

    const [balances, requests] = await Promise.all([
      db.leaveBalance.findMany({
        where: { employeeId: emp.id, year },
        include: { leaveType: true },
        orderBy: { leaveTypeId: "asc" },
      }),
      db.leaveRequest.findMany({
        where: { employeeId: emp.id },
        orderBy: { appliedAt: "desc" },
        take: 50,
        include: { leaveType: true, substitute: true },
      }),
    ]);

    // approver is a plain id column — resolve names manually
    const approverIds = [...new Set(requests.map((r) => r.approverId).filter((x): x is string => !!x))];
    const approvers = approverIds.length
      ? await db.employee.findMany({ where: { id: { in: approverIds } } })
      : [];
    const approverMap = new Map(approvers.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));

    return ok({
      balances: balances.map((b) => ({
        leaveTypeId: b.leaveTypeId,
        name: b.leaveType.name,
        code: b.leaveType.code,
        color: b.leaveType.color,
        entitled: b.entitled,
        used: b.used,
        pending: b.pending,
        available: Math.max(0, b.entitled - b.used - b.pending),
      })),
      requests: requests.map((r) => ({
        id: r.id,
        code: r.code,
        leaveTypeId: r.leaveTypeId,
        leaveTypeName: r.leaveType.name,
        leaveTypeColor: r.leaveType.color,
        fromDate: r.fromDate.toISOString(),
        toDate: r.toDate.toISOString(),
        dayMode: r.dayMode,
        days: r.days,
        reason: r.reason,
        status: r.status,
        currentStage: r.currentStage,
        appliedAt: r.appliedAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
        decisionNote: r.decisionNote ?? null,
        approverName: r.approverId ? approverMap.get(r.approverId) ?? null : null,
        substituteName: r.substitute ? `${r.substitute.firstName} ${r.substitute.lastName}` : null,
        contactDuringLeave: r.contactDuringLeave ?? null,
        attachmentName: r.attachmentName ?? null,
      })),
    });
  } catch (err) {
    return serverError(err);
  }
}

// ── POST: create / cancel ───────────────────────────────────
const createSchema = z.object({
  action: z.literal("create").default("create"),
  leaveTypeId: z.string().min(1),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "From date must be YYYY-MM-DD"),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "To date must be YYYY-MM-DD"),
  dayMode: z.enum(DAY_MODES).default("FULL"),
  reason: z.string().trim().min(5, "Reason must be at least 5 characters"),
  contactDuringLeave: z.string().trim().max(60).optional(),
  substituteId: z.string().optional(),
  attachmentName: z.string().trim().max(200).optional(),
});

const cancelSchema = z.object({
  action: z.literal("cancel"),
  id: z.string().min(1),
});

const bodySchema = z.union([createSchema, cancelSchema]);

function parseDay(s: string): Date | null {
  const [y, m, d] = s.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(day.getTime()) ? null : day;
}

export async function POST(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;

    const raw = (await req.json().catch(() => null)) as unknown;
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return badRequest("VALIDATION_ERROR", issue?.message ?? "Invalid input.");
    }
    const input = parsed.data;

    // ── cancel own pending request ──
    if (input.action === "cancel") {
      const reqRow = await db.leaveRequest.findUnique({ where: { id: input.id } });
      if (!reqRow || reqRow.employeeId !== emp.id) {
        return badRequest("NOT_FOUND", "Leave request not found.");
      }
      if (reqRow.status !== "PENDING") {
        return badRequest("NOT_CANCELLABLE", "Only pending requests can be withdrawn.");
      }
      const updated = await db.leaveRequest.update({
        where: { id: reqRow.id },
        data: {
          status: "CANCELLED",
          currentStage: "DONE",
          decidedAt: new Date(),
          decisionNote: "Withdrawn by employee",
        },
      });
      // revert pending count on the balance
      const year = reqRow.fromDate.getUTCFullYear();
      const bal = await db.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: emp.id, leaveTypeId: reqRow.leaveTypeId, year } },
      });
      if (bal) {
        await db.leaveBalance.update({
          where: { id: bal.id },
          data: { pending: Math.max(0, bal.pending - reqRow.days) },
        });
      }
      await audit(emp, "LEAVE_CANCELLED", "LeaveRequest", updated.id, `${updated.code} withdrawn (${updated.days} day/s)`);

      if (emp.managerId) {
        await notify(emp.managerId, `Leave request ${updated.code} withdrawn`, `${emp.firstName} ${emp.lastName} withdrew the request.`, "LEAVE", "leave");
      }
      return ok({ id: updated.id, code: updated.code, status: updated.status });
    }

    // ── create ──
    const fromDate = parseDay(input.fromDate);
    const toDate = parseDay(input.toDate);
    if (!fromDate || !toDate) return badRequest("VALIDATION_ERROR", "Invalid date range.");
    if (fromDate.getTime() > toDate.getTime()) {
      return badRequest("INVALID_RANGE", "From date cannot be after to date.");
    }

    const leaveType = await db.leaveType.findUnique({ where: { id: input.leaveTypeId } });
    if (!leaveType) return badRequest("NOT_FOUND", "Leave type not found.");

    // days = inclusive range length × mode factor
    const rangeDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    const days = rangeDays * (input.dayMode === "FULL" ? 1 : 0.5);

    // balance validation
    const year = fromDate.getUTCFullYear();
    const bal = await db.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId: emp.id, leaveTypeId: leaveType.id, year } },
    });
    const entitled = bal?.entitled ?? 0;
    const used = bal?.used ?? 0;
    const pending = bal?.pending ?? 0;
    const available = entitled - used - pending;
    if (days > available) {
      return badRequest(
        "INSUFFICIENT_BALANCE",
        `Insufficient balance for ${leaveType.name}: ${available} day(s) available, ${days} requested.`
      );
    }

    // optional substitute must be a real coworker (same company, not self)
    let substituteId: string | null = null;
    if (input.substituteId) {
      const sub = await db.employee.findFirst({
        where: { id: input.substituteId, companyId: emp.companyId ?? undefined },
      });
      if (!sub || sub.id === emp.id) {
        return badRequest("NOT_FOUND", "Selected substitute is not a valid coworker.");
      }
      substituteId = sub.id;
    }

    // code: LR-1xxx incrementing
    const existing = await db.leaveRequest.findMany({ where: { code: { startsWith: "LR-" } } });
    let maxNum = 1000;
    for (const r of existing) {
      const n = parseInt(r.code.slice(3), 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
    const code = `LR-${maxNum + 1}`;

    const created = await db.leaveRequest.create({
      data: {
        code,
        employeeId: emp.id,
        leaveTypeId: leaveType.id,
        fromDate,
        toDate,
        dayMode: input.dayMode,
        days,
        reason: input.reason,
        contactDuringLeave: input.contactDuringLeave ?? null,
        substituteId,
        attachmentName: input.attachmentName ?? null,
        status: "PENDING",
        currentStage: "MANAGER",
      },
    });

    // increment pending count
    if (bal) {
      await db.leaveBalance.update({ where: { id: bal.id }, data: { pending: pending + days } });
    } else {
      await db.leaveBalance.create({
        data: { employeeId: emp.id, leaveTypeId: leaveType.id, year, entitled: 0, used: 0, pending: days },
      });
    }

    await audit(emp, "LEAVE_REQUESTED", "LeaveRequest", created.id, `${code} · ${leaveType.name} · ${days} day(s)`);

    if (emp.managerId) {
      await notify(
        emp.managerId,
        `Leave request ${code} awaiting your approval`,
        `${emp.firstName} ${emp.lastName} · ${leaveType.name} · ${days} day(s)`,
        "APPROVAL",
        "approvals"
      );
    }

    return ok({
      id: created.id,
      code: created.code,
      days: created.days,
      status: created.status,
      currentStage: created.currentStage,
    });
  } catch (err) {
    return serverError(err);
  }
}
