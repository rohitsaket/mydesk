import { db } from "@/lib/db";
import {
  getAuth, ok, unauthorized, forbidden, badRequest, serverError, audit, isManagerOrAbove,
} from "@/lib/hrms/auth";
import { notify } from "@/lib/hrms/attendance";
import { fmtDateShort, fmtDuration, fmtINR, minutesBetween } from "@/lib/hrms/time";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    kind: z.enum(["leave", "duty", "attendance", "timesheet", "expense"]),
    id: z.string().min(1).optional(),
    ids: z.array(z.string().min(1)).min(1).max(50).optional(),
    action: z.enum(["approve", "reject", "pay"]),
    comment: z.string().max(500).optional(),
  })
  .refine((v) => v.id !== undefined || v.ids !== undefined, {
    message: "Provide an `id` or `ids` array.",
  });

function notFound(message: string) {
  return Response.json({ success: false, error: { code: "NOT_FOUND", message } }, { status: 404 });
}

function isHRRole(role: string): boolean {
  return role === "HR" || role === "ADMIN";
}

type Comment = string | null;

export async function POST(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const me = auth.employee;
    if (!isManagerOrAbove(me.role)) {
      return forbidden("Only managers, HR and admins can take approval decisions.");
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return badRequest("VALIDATION_ERROR", issue?.message ?? "Invalid decision payload.");
    }
    const { kind, action } = parsed.data;
    const comment = parsed.data.comment?.trim() ? parsed.data.comment.trim() : null;
    const ids = [...new Set(parsed.data.ids ?? [parsed.data.id!])];
    if (ids.length === 0) return badRequest("VALIDATION_ERROR", "No request ids supplied.");

    // ── load + authorize everything first (all-or-nothing batch) ──
    const targets: { id: string; employeeId: string; employeeName: string }[] = [];

    if (kind === "leave") {
      for (const id of ids) {
        const r = await db.leaveRequest.findUnique({ where: { id }, include: { employee: true } });
        if (!r) return notFound("Leave request not found.");
        // Manager stage → requester's manager only; HR stage → HR/admin only
        // (matches the approvals inbox scoping and prevents a manager from
        // finalising a request that has already been forwarded to HR).
        const authorized =
          (r.currentStage === "MANAGER" && r.employee.managerId === me.id) ||
          (r.currentStage === "HR" && isHRRole(me.role));
        if (!authorized) {
          return forbidden("This leave request is not in your approval chain.");
        }
        if (r.status !== "PENDING") {
          return badRequest("ALREADY_DECIDED", `${r.code} has already been ${r.status.toLowerCase()}.`);
        }
        targets.push({ id: r.id, employeeId: r.employeeId, employeeName: `${r.employee.firstName} ${r.employee.lastName}` });
      }
      await decideLeave(ids, action, comment, me.id, me.firstName, me.lastName);
    } else if (kind === "duty") {
      for (const id of ids) {
        const r = await db.dutyRequest.findUnique({ where: { id }, include: { employee: true } });
        if (!r) return notFound("Duty request not found.");
        if (r.employee.managerId !== me.id) {
          return forbidden("This duty request is not from your team.");
        }
        if (r.status !== "PENDING") {
          return badRequest("ALREADY_DECIDED", `${r.code} has already been ${r.status.toLowerCase()}.`);
        }
        targets.push({ id: r.id, employeeId: r.employeeId, employeeName: `${r.employee.firstName} ${r.employee.lastName}` });
      }
      await decideDuty(ids, action, comment, me.id, me.firstName, me.lastName);
    } else if (kind === "attendance") {
      for (const id of ids) {
        const r = await db.regularization.findUnique({ where: { id }, include: { employee: true } });
        if (!r) return notFound("Regularization request not found.");
        if (r.employee.managerId !== me.id) {
          return forbidden("This regularization request is not from your team.");
        }
        if (r.status !== "PENDING") {
          return badRequest("ALREADY_DECIDED", `${r.code} has already been ${r.status.toLowerCase()}.`);
        }
        targets.push({ id: r.id, employeeId: r.employeeId, employeeName: `${r.employee.firstName} ${r.employee.lastName}` });
      }
      await decideAttendance(ids, action, comment, me.id, me.firstName, me.lastName);
    } else if (kind === "timesheet") {
      for (const id of ids) {
        const r = await db.timesheetEntry.findUnique({ where: { id }, include: { employee: true } });
        if (!r) return notFound("Timesheet entry not found.");
        if (r.employee.managerId !== me.id) {
          return forbidden("This timesheet is not from your team.");
        }
        if (r.status !== "SUBMITTED") {
          return badRequest("ALREADY_DECIDED", "This timesheet entry has already been decided.");
        }
        targets.push({ id: r.id, employeeId: r.employeeId, employeeName: `${r.employee.firstName} ${r.employee.lastName}` });
      }
      await decideTimesheet(ids, action, comment, me.id, me.firstName, me.lastName);
    } else {
      for (const id of ids) {
        const r = await db.expense.findUnique({ where: { id }, include: { employee: true } });
        if (!r) return notFound("Expense not found.");
        // Requester's manager may act on their chain; HR/finance may act at any
        // finance stage (MANAGER_APPROVED / FINANCE_APPROVED).
        const isRequesterManager = r.employee.managerId === me.id;
        const authorized = isRequesterManager || isHRRole(me.role);
        if (!authorized) {
          return forbidden("This expense is not in your approval chain.");
        }
        const err = expenseActionable(r.status, action, isRequesterManager, isHRRole(me.role));
        if (err) return badRequest("INVALID_STATE", err);
        targets.push({ id: r.id, employeeId: r.employeeId, employeeName: `${r.employee.firstName} ${r.employee.lastName}` });
      }
      await decideExpense(ids, action, comment, me.id, me.firstName, me.lastName);
    }

    const actionLabel = action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "PAID";
    await audit(
      me,
      action === "pay" ? "EXPENSE_PAID" : `${kind.toUpperCase()}_${actionLabel}`,
      kind === "attendance" ? "Regularization" : kind === "timesheet" ? "TimesheetEntry" : kind === "leave" ? "LeaveRequest" : kind === "duty" ? "DutyRequest" : "Expense",
      ids[0],
      `${action} ${ids.length} item(s) for ${[...new Set(targets.map((t) => t.employeeName))].join(", ")}${comment ? ` — ${comment}` : ""}`
    );

    return ok({ processed: ids.length, kind, action });
  } catch (err) {
    return serverError(err);
  }
}

function expenseActionable(status: string, action: string, isRequesterManager: boolean, isHR: boolean): string | null {
  if (action === "pay") {
    if (!isHR) return "Only HR/finance can mark expenses as paid.";
    if (status !== "FINANCE_APPROVED") return "Only finance-approved expenses can be marked paid.";
    return null;
  }
  if (status === "SUBMITTED") {
    // A finance-only decider (HR who is not the requester's manager) jumps
    // straight to FINANCE_APPROVED; the requester's manager goes to MANAGER_APPROVED.
    return null;
  }
  if (status === "MANAGER_APPROVED") {
    if (action === "approve" && isRequesterManager && !isHR) {
      return "Already manager-approved — awaiting finance.";
    }
    return null;
  }
  if (status === "FINANCE_APPROVED") return "Already finance-approved — use the pay action.";
  return `Expense is ${status.replace(/_/g, " ").toLowerCase()} — no action available.`;
}

// ── LEAVE ────────────────────────────────────────────────────
async function decideLeave(ids: string[], action: string, comment: Comment, myId: string, myFirst: string, myLast: string) {
  const now = new Date();
  for (const id of ids) {
    const r = await db.leaveRequest.findUnique({
      where: { id },
      include: { employee: true, leaveType: true },
    });
    if (!r) continue;

    if (action === "approve" && r.currentStage === "MANAGER") {
      await db.leaveRequest.update({
        where: { id },
        data: { currentStage: "HR", approverId: myId },
      });
      await notify(
        r.employeeId,
        `Leave request ${r.code} forwarded to HR`,
        `${r.leaveType.name} (${r.days} day${r.days === 1 ? "" : "s"}, ${fmtDateShort(r.fromDate)}) forwarded to HR for final approval.${comment ? ` Manager note: ${comment}` : ""}`,
        "LEAVE",
        "leave"
      );
      continue;
    }

    if (action === "approve" && r.currentStage === "HR") {
      await db.leaveRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          currentStage: "DONE",
          decidedAt: now,
          decisionNote: comment,
          approverId: myId,
        },
      });
      const balance = await db.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: r.fromDate.getUTCFullYear() } },
      });
      if (balance) {
        await db.leaveBalance.update({
          where: { id: balance.id },
          data: {
            used: balance.used + r.days,
            pending: Math.max(0, balance.pending - r.days),
          },
        });
      }
      await notify(
        r.employeeId,
        `Leave request ${r.code} approved`,
        `${r.leaveType.name} (${r.days} day${r.days === 1 ? "" : "s"}) approved by HR.${comment ? ` Note: ${comment}` : ""}`,
        "LEAVE",
        "leave"
      );
      continue;
    }

    // reject
    await db.leaveRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        currentStage: "DONE",
        decidedAt: now,
        decisionNote: comment,
        approverId: myId,
      },
    });
    const balance = await db.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, year: r.fromDate.getUTCFullYear() } },
    });
    if (balance) {
      await db.leaveBalance.update({
        where: { id: balance.id },
        data: { pending: Math.max(0, balance.pending - r.days) },
      });
    }
    await notify(
      r.employeeId,
      `Leave request ${r.code} rejected`,
      `${r.leaveType.name} request rejected by ${myFirst} ${myLast}.${comment ? ` Reason: ${comment}` : ""}`,
      "LEAVE",
      "leave"
    );
  }
}

// ── DUTY (WFH / ON-DUTY) ─────────────────────────────────────
async function decideDuty(ids: string[], action: string, comment: Comment, myId: string, myFirst: string, myLast: string) {
  const now = new Date();
  for (const id of ids) {
    const r = await db.dutyRequest.findUnique({ where: { id } });
    if (!r) continue;
    const status = action === "approve" ? "APPROVED" : "REJECTED";
    await db.dutyRequest.update({
      where: { id },
      data: { status, decidedAt: now, decisionNote: comment, approverId: myId },
    });
    const typeLabel = r.type === "WFH" ? "WFH" : "On-duty";
    await notify(
      r.employeeId,
      `${typeLabel} request ${r.code} ${status.toLowerCase()}`,
      `${typeLabel} on ${fmtDateShort(r.fromDate)}${r.destination ? ` (${r.destination})` : ""} ${status.toLowerCase()} by ${myFirst} ${myLast}.${comment ? ` Note: ${comment}` : ""}`,
      "APPROVAL",
      r.type === "WFH" ? "wfh" : "onduty"
    );
  }
}

// ── ATTENDANCE REGULARIZATION ────────────────────────────────
async function decideAttendance(ids: string[], action: string, comment: Comment, myId: string, _myFirst: string, _myLast: string) {
  const now = new Date();
  for (const id of ids) {
    const r = await db.regularization.findUnique({ where: { id } });
    if (!r) continue;

    if (action === "approve") {
      const appliedCheckIn = r.requestedCheckIn ?? r.currentCheckIn;
      const appliedCheckOut = r.requestedCheckOut ?? r.currentCheckOut;
      await db.regularization.update({
        where: { id },
        data: {
          status: "APPROVED",
          approverId: myId,
          decidedAt: now,
          decisionNote: comment,
          appliedCheckIn,
          appliedCheckOut,
        },
      });

      const day = await db.attendanceDay.findUnique({
        where: { employeeId_date: { employeeId: r.employeeId, date: r.date } },
      });
      const firstCheckIn = r.requestedCheckIn ?? day?.firstCheckIn ?? null;
      const lastCheckOut = r.requestedCheckOut ?? day?.lastCheckOut ?? null;
      const gross =
        firstCheckIn && lastCheckOut ? minutesBetween(firstCheckIn, lastCheckOut) : day?.grossMinutes ?? 0;
      const breakMinutes = day?.breakMinutes ?? 0;
      const net = Math.max(0, gross - breakMinutes);
      const required = day?.requiredMinutes ?? 510;

      const dayData = {
        firstCheckIn,
        lastCheckOut,
        grossMinutes: gross,
        netMinutes: net,
        breakMinutes,
        requiredMinutes: required,
        overtimeMinutes: Math.max(0, net - required),
        status: "P",
        state: lastCheckOut ? "CHECKED_OUT" : firstCheckIn ? "WORKING" : "NOT_STARTED",
        regularized: true,
        remark: `Regularized via ${r.code}`,
      };
      if (day) {
        await db.attendanceDay.update({ where: { id: day.id }, data: dayData });
      } else {
        await db.attendanceDay.create({
          data: { employeeId: r.employeeId, date: r.date, ...dayData },
        });
      }

      await notify(
        r.employeeId,
        `Regularization ${r.code} approved`,
        `${fmtDateShort(r.date)} approved. Your punches were updated (net ${fmtDuration(net)}).${comment ? ` Note: ${comment}` : ""}`,
        "ATTENDANCE",
        "attendance"
      );
    } else {
      await db.regularization.update({
        where: { id },
        data: { status: "REJECTED", approverId: myId, decidedAt: now, decisionNote: comment },
      });
      await notify(
        r.employeeId,
        `Regularization ${r.code} rejected`,
        `Request for ${fmtDateShort(r.date)} was rejected.${comment ? ` Reason: ${comment}` : ""}`,
        "ATTENDANCE",
        "attendance"
      );
    }
  }
}

// ── TIMESHEET ────────────────────────────────────────────────
async function decideTimesheet(ids: string[], action: string, comment: Comment, myId: string, _myFirst: string, _myLast: string) {
  const now = new Date();
  const byEmployee = new Map<string, { name: string; weekStart: Date; minutes: number; count: number }>();
  for (const id of ids) {
    const r = await db.timesheetEntry.findUnique({ where: { id }, include: { employee: true } });
    if (!r) continue;
    await db.timesheetEntry.update({
      where: { id },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        approverId: myId,
        decidedAt: now,
        decisionNote: comment,
      },
    });
    const agg = byEmployee.get(r.employeeId) ?? {
      name: `${r.employee.firstName} ${r.employee.lastName}`,
      weekStart: r.weekStart,
      minutes: 0,
      count: 0,
    };
    agg.minutes += r.minutes;
    agg.count += 1;
    byEmployee.set(r.employeeId, agg);
  }
  for (const [employeeId, agg] of byEmployee) {
    await notify(
      employeeId,
      `Timesheet week of ${fmtDateShort(agg.weekStart)} ${action === "approve" ? "approved" : "rejected"}`,
      `Week of ${fmtDateShort(agg.weekStart)} — ${agg.count} entr${agg.count === 1 ? "y" : "ies"}, ${fmtDuration(agg.minutes)} ${action === "approve" ? "approved" : "rejected"}.${comment ? ` Note: ${comment}` : ""}`,
      "APPROVAL",
      "timesheet"
    );
  }
}

// ── EXPENSE ──────────────────────────────────────────────────
async function decideExpense(ids: string[], action: string, comment: Comment, myId: string, myFirst: string, myLast: string) {
  const now = new Date();
  for (const id of ids) {
    const r = await db.expense.findUnique({ where: { id }, include: { employee: true } });
    if (!r) continue;
    // Spec: approve → MANAGER_APPROVED when the decider is the requester's
    // manager; an HR/finance decider (not the manager) finalizes → FINANCE_APPROVED.
    const isRequesterManager = r.employee.managerId === myId;

    if (action === "pay") {
      await db.expense.update({
        where: { id },
        data: { status: "PAID", paidAt: now, approverId: myId, decidedAt: now, decisionNote: comment },
      });
      await notify(
        r.employeeId,
        `Expense ${r.code} paid`,
        `${fmtINR(r.amount)} marked as paid by finance.${comment ? ` Note: ${comment}` : ""}`,
        "EXPENSE",
        "expenses"
      );
      continue;
    }

    if (action === "reject") {
      await db.expense.update({
        where: { id },
        data: { status: "REJECTED", decidedAt: now, decisionNote: comment, approverId: myId },
      });
      await notify(
        r.employeeId,
        `Expense ${r.code} rejected`,
        `${fmtINR(r.amount)} ${r.category.toLowerCase()} claim rejected by ${myFirst} ${myLast}.${comment ? ` Reason: ${comment}` : ""}`,
        "EXPENSE",
        "expenses"
      );
      continue;
    }

    // approve
    const nextStatus =
      r.status === "SUBMITTED" && isRequesterManager
        ? "MANAGER_APPROVED"
        : "FINANCE_APPROVED";
    await db.expense.update({
      where: { id },
      data: { status: nextStatus, decidedAt: now, decisionNote: comment, approverId: myId },
    });
    await notify(
      r.employeeId,
      nextStatus === "MANAGER_APPROVED" ? `Expense ${r.code} approved by manager` : `Expense ${r.code} approved by finance`,
      `${fmtINR(r.amount)} ${nextStatus === "MANAGER_APPROVED" ? "approved at manager level and sent to finance" : "approved for payment"}.${comment ? ` Note: ${comment}` : ""}`,
      "EXPENSE",
      "expenses"
    );
  }
}
