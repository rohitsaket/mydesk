import { z } from "zod";
import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError, badRequest, audit } from "@/lib/hrms/auth";
import { notify } from "@/lib/hrms/attendance";

export const dynamic = "force-dynamic";

const DUTY_TYPES = ["WFH", "ON_DUTY"] as const;
const SUBTYPES = ["CLIENT_VISIT", "FIELD_VISIT", "TRAINING", "CONFERENCE", "TRAVEL", "REMOTE_SITE"] as const;

// ── GET: own duty requests (optional type filter) ────────────
export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const url = new URL(req.url);
    const typeParam = url.searchParams.get("type");
    const where: { employeeId: string; type?: string } = { employeeId: auth.employee.id };
    if (typeParam === "WFH" || typeParam === "ON_DUTY") where.type = typeParam;

    const rows = await db.dutyRequest.findMany({
      where,
      orderBy: { appliedAt: "desc" },
      take: 50,
    });
    return ok({
      requests: rows.map((r) => ({
        id: r.id,
        code: r.code,
        type: r.type,
        subtype: r.subtype ?? null,
        fromDate: r.fromDate.toISOString(),
        toDate: r.toDate?.toISOString() ?? null,
        hours: r.hours ?? null,
        reason: r.reason,
        destination: r.destination ?? null,
        clientName: r.clientName ?? null,
        contact: r.contact ?? null,
        address: r.address ?? null,
        status: r.status,
        appliedAt: r.appliedAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
        decisionNote: r.decisionNote ?? null,
      })),
    });
  } catch (err) {
    return serverError(err);
  }
}

// ── POST: create / cancel ───────────────────────────────────
const createSchema = z.object({
  action: z.literal("create").default("create"),
  type: z.enum(DUTY_TYPES),
  subtype: z.enum(SUBTYPES).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  hours: z.number().int().min(1).max(12).optional(),
  reason: z.string().trim().min(5, "Reason must be at least 5 characters"),
  destination: z.string().trim().max(200).optional(),
  clientName: z.string().trim().max(120).optional(),
  contact: z.string().trim().max(60).optional(),
  address: z.string().trim().max(300).optional(),
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
      const row = await db.dutyRequest.findUnique({ where: { id: input.id } });
      if (!row || row.employeeId !== emp.id) {
        return badRequest("NOT_FOUND", "Request not found.");
      }
      if (row.status !== "PENDING") {
        return badRequest("NOT_CANCELLABLE", "Only pending requests can be withdrawn.");
      }
      const updated = await db.dutyRequest.update({
        where: { id: row.id },
        data: { status: "CANCELLED", decidedAt: new Date(), decisionNote: "Withdrawn by employee" },
      });
      await audit(emp, "DUTY_REQUEST_CANCELLED", "DutyRequest", updated.id, `${updated.code} withdrawn`);
      if (emp.managerId) {
        await notify(emp.managerId, `${updated.type === "WFH" ? "WFH" : "On-duty"} request ${updated.code} withdrawn`, `${emp.firstName} ${emp.lastName} withdrew the request.`, "APPROVAL", "approvals");
      }
      return ok({ id: updated.id, code: updated.code, status: updated.status });
    }

    // ── create ──
    const fromDate = parseDay(input.fromDate);
    if (!fromDate) return badRequest("VALIDATION_ERROR", "Invalid date.");
    const toDate = input.toDate ? parseDay(input.toDate) : null;
    if (toDate && fromDate.getTime() > toDate.getTime()) {
      return badRequest("INVALID_RANGE", "From date cannot be after to date.");
    }
    if (input.type === "ON_DUTY" && !input.subtype) {
      return badRequest("VALIDATION_ERROR", "Select a visit type (subtype) for on-duty requests.");
    }

    // code: DR-2xx incrementing
    const existing = await db.dutyRequest.findMany({ where: { code: { startsWith: "DR-" } } });
    let maxNum = 200;
    for (const r of existing) {
      const n = parseInt(r.code.slice(3), 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
    const code = `DR-${maxNum + 1}`;

    const created = await db.dutyRequest.create({
      data: {
        code,
        employeeId: emp.id,
        type: input.type,
        subtype: input.subtype ?? null,
        fromDate,
        toDate: toDate ?? null,
        hours: input.hours ?? null,
        reason: input.reason,
        destination: input.destination ?? null,
        clientName: input.clientName ?? null,
        contact: input.contact ?? null,
        address: input.address ?? null,
        attachmentName: input.attachmentName ?? null,
        status: "PENDING",
      },
    });

    await audit(emp, input.type === "WFH" ? "WFH_REQUESTED" : "ON_DUTY_REQUESTED", "DutyRequest", created.id, `${code} on ${input.fromDate}`);

    if (emp.managerId) {
      const label = input.type === "WFH" ? "WFH" : "On-duty";
      await notify(
        emp.managerId,
        `${label} request ${code} awaiting your approval`,
        `${emp.firstName} ${emp.lastName} · ${input.fromDate}${toDate ? ` → ${input.toDate}` : ""}`,
        "APPROVAL",
        "approvals"
      );
    }

    return ok({ id: created.id, code: created.code, status: created.status });
  } catch (err) {
    return serverError(err);
  }
}
