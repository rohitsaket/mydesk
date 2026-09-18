import { z } from "zod";
import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError, badRequest, audit, requestDeviceInfo } from "@/lib/hrms/auth";
import { dayIST, istTime, parseHHMM, ATTENDANCE_STATUS_LABELS } from "@/lib/hrms/time";
import { notify } from "@/lib/hrms/attendance";

export const dynamic = "force-dynamic";

// ── GET: own regularization requests ─────────────────────────
export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const rows = await db.regularization.findMany({
      where: { employeeId: auth.employee.id },
      orderBy: { appliedAt: "desc" },
      take: 50,
    });
    return ok({
      requests: rows.map((r) => ({
        id: r.id,
        code: r.code,
        date: r.date.toISOString(),
        currentCheckIn: r.currentCheckIn?.toISOString() ?? null,
        currentCheckOut: r.currentCheckOut?.toISOString() ?? null,
        requestedCheckIn: r.requestedCheckIn?.toISOString() ?? null,
        requestedCheckOut: r.requestedCheckOut?.toISOString() ?? null,
        reason: r.reason,
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

// ── POST: create regularization request ─────────────────────
const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  requestedCheckIn: z.string().regex(/^\d{2}:\d{2}$/, "Requested check-in must be HH:MM"),
  requestedCheckOut: z.string().regex(/^\d{2}:\d{2}$/, "Requested check-out must be HH:MM"),
  reason: z.string().trim().min(3, "Reason must be at least 3 characters"),
  attachmentName: z.string().trim().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return badRequest("VALIDATION_ERROR", issue?.message ?? "Invalid input.");
    }
    const input = parsed.data;

    const [y, m, dd] = input.date.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, dd));
    if (Number.isNaN(day.getTime())) return badRequest("VALIDATION_ERROR", "Invalid date.");
    const today = dayIST(new Date());
    if (day.getTime() >= today.getTime()) {
      return badRequest("DATE_NOT_PAST", "Regularization can only be requested for a past date.");
    }

    // existing day record (server-side source of truth for current punches)
    const dayRow = await db.attendanceDay.findUnique({
      where: { employeeId_date: { employeeId: emp.id, date: day } },
    });
    if (dayRow && (dayRow.status === "WO" || dayRow.status === "H")) {
      return badRequest(
        "REGULARIZATION_NOT_APPLICABLE",
        `${day.toISOString().slice(0, 10)} is a ${ATTENDANCE_STATUS_LABELS[dayRow.status] ?? dayRow.status}. Regularization is not applicable.`
      );
    }

    // no duplicate pending request for the same date
    const dup = await db.regularization.findFirst({
      where: { employeeId: emp.id, date: day, status: "PENDING" },
    });
    if (dup) {
      return badRequest("DUPLICATE_REQUEST", `A pending regularization (${dup.code}) already exists for this date.`);
    }

    const inMin = parseHHMM(input.requestedCheckIn);
    const outMin = parseHHMM(input.requestedCheckOut);
    if (outMin <= inMin) {
      return badRequest("INVALID_TIME_RANGE", "Requested check-out must be later than requested check-in.");
    }

    // code: AR-3xx incrementing
    const existing = await db.regularization.findMany({ where: { code: { startsWith: "AR-" } } });
    let maxNum = 300;
    for (const r of existing) {
      const n = parseInt(r.code.slice(3), 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
    const code = `AR-${maxNum + 1}`;

    const created = await db.regularization.create({
      data: {
        code,
        employeeId: emp.id,
        date: day,
        currentCheckIn: dayRow?.firstCheckIn ?? null,
        currentCheckOut: dayRow?.lastCheckOut ?? null,
        requestedCheckIn: istTime(day, Math.floor(inMin / 60), inMin % 60),
        requestedCheckOut: istTime(day, Math.floor(outMin / 60), outMin % 60),
        reason: input.reason,
        attachmentName: input.attachmentName ?? null,
      },
    });

    const device = await requestDeviceInfo();
    await audit(emp, "REGULARIZATION_REQUESTED", "Regularization", created.id, `${code} for ${input.date}: ${input.requestedCheckIn}–${input.requestedCheckOut}`);

    if (emp.managerId) {
      await notify(
        emp.managerId,
        `Attendance regularization ${code} awaiting your approval`,
        `${emp.firstName} ${emp.lastName} · ${input.date} · ${device}`,
        "APPROVAL",
        "approvals"
      );
    }

    return ok({
      id: created.id,
      code: created.code,
      date: created.date.toISOString(),
      requestedCheckIn: created.requestedCheckIn?.toISOString() ?? null,
      requestedCheckOut: created.requestedCheckOut?.toISOString() ?? null,
      reason: created.reason,
      status: created.status,
      appliedAt: created.appliedAt.toISOString(),
    });
  } catch (err) {
    return serverError(err);
  }
}
