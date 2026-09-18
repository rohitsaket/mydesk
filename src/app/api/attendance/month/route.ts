import { z } from "zod";
import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError, badRequest } from "@/lib/hrms/auth";
import { dayIST, addDays, ATTENDANCE_STATUS_LABELS } from "@/lib/hrms/time";
import { computeBreaks, computeWorkedMinutes } from "@/lib/hrms/attendance";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const querySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      year: url.searchParams.get("year") ?? undefined,
      month: url.searchParams.get("month") ?? undefined,
    });
    if (!parsed.success) {
      return badRequest("VALIDATION_ERROR", "Provide a valid year (YYYY) and month (1-12).");
    }
    const { year, month } = parsed.data;

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = new Date(Date.UTC(year, month - 1, daysInMonth));
    const now = new Date();
    const today = dayIST(now);

    // base data for the window
    const [days, holidays, leaves, duties, assignments, genShift] = await Promise.all([
      db.attendanceDay.findMany({
        where: { employeeId: emp.id, date: { gte: monthStart, lte: monthEnd } },
        include: { shift: true },
      }),
      db.holiday.findMany({
        where: { date: { gte: monthStart, lte: monthEnd }, ...(emp.companyId ? { companyId: emp.companyId } : {}) },
      }),
      db.leaveRequest.findMany({
        where: {
          employeeId: emp.id, status: "APPROVED",
          fromDate: { lte: monthEnd }, toDate: { gte: monthStart },
        },
      }),
      db.dutyRequest.findMany({
        where: {
          employeeId: emp.id, status: "APPROVED",
          fromDate: { lte: addDays(monthEnd, 1) }, toDate: { gte: monthStart },
        },
      }),
      db.shiftAssignment.findMany({
        where: { employeeId: emp.id, date: { gte: monthStart, lte: monthEnd } },
        include: { shift: true },
      }),
      db.shift.findFirst({ where: { code: "GEN" } }),
    ]);

    // live computation for today (if today falls inside the requested month)
    const todayRow = days.find((d) => d.date.getTime() === today.getTime());
    let todayLive: { workedMinutes: number; breakMinutes: number } | null = null;
    if (todayRow && todayRow.state !== "CHECKED_OUT") {
      const events = await db.attendanceEvent.findMany({
        where: { dayId: todayRow.id },
        orderBy: { timestamp: "asc" },
      });
      const breaks = computeBreaks(events, now);
      const { net, breakMinutes } = computeWorkedMinutes(todayRow, breaks, now);
      todayLive = { workedMinutes: net, breakMinutes };
    }

    const holidayMap = new Map(holidays.map((h) => [h.date.getTime(), h]));
    const assignmentMap = new Map(assignments.map((a) => [a.date.getTime(), a.shift]));
    const dayMap = new Map(days.map((d) => [d.date.getTime(), d]));

    const isOnLeave = (d: Date) => leaves.some((l) => l.fromDate.getTime() <= d.getTime() && l.toDate.getTime() >= d.getTime());
    const dutyOn = (d: Date, type: "WFH" | "ON_DUTY") =>
      duties.some((r) => r.type === type && r.fromDate.getTime() <= d.getTime() && (r.toDate ?? r.fromDate).getTime() >= d.getTime());

    type DayOut = {
      date: string; dayName: string; status: string; statusLabel: string; state: string;
      firstCheckIn: string | null; lastCheckOut: string | null;
      workedMinutes: number; breakMinutes: number; overtimeMinutes: number; lateMinutes: number;
      shiftName: string | null; regularized: boolean; hasRecord: boolean;
    };

    const outDays: DayOut[] = [];
    const summary = {
      present: 0, absent: 0, leave: 0, halfDay: 0, late: 0, wfh: 0, onDuty: 0,
      weeklyOff: 0, holiday: 0, missingPunch: 0,
      averageMinutes: 0, payableDays: 0, overtimeMinutes: 0,
    };
    let totalMinutes = 0, countedDays = 0, overtimeTotal = 0;

    for (let i = 0; i < daysInMonth; i++) {
      const d = new Date(Date.UTC(year, month - 1, i + 1));
      const t = d.getTime();
      const row = dayMap.get(t);
      const shift = row?.shift ?? assignmentMap.get(t) ?? genShift;
      const isFuture = t > today.getTime();

      let status: string;
      let firstCheckIn: Date | null = row?.firstCheckIn ?? null;
      let lastCheckOut: Date | null = row?.lastCheckOut ?? null;
      let workedMinutes = row?.netMinutes ?? 0;
      let breakMinutes = row?.breakMinutes ?? 0;
      let overtimeMinutes = row?.overtimeMinutes ?? 0;
      let lateMinutes = row?.lateMinutes ?? 0;

      if (row) {
        status = row.status;
        if (todayLive && t === today.getTime()) {
          workedMinutes = todayLive.workedMinutes;
          breakMinutes = todayLive.breakMinutes;
          overtimeMinutes = Math.max(0, workedMinutes - (row.requiredMinutes || shift?.requiredMinutes || 510));
        }
      } else {
        // derive status for days without a record
        const dow = d.getUTCDay();
        const weeklyOff = (shift?.weeklyOff ?? genShift?.weeklyOff ?? "0").split(",").map((x) => parseInt(x, 10));
        if (weeklyOff.includes(dow)) status = "WO";
        else if (holidayMap.has(t)) status = "H";
        else if (isOnLeave(d)) status = "L";
        else if (dutyOn(d, "WFH")) status = "WFH";
        else if (dutyOn(d, "ON_DUTY")) status = "OD";
        else status = isFuture ? "PENDING" : "A";
      }

      switch (status) {
        case "P": summary.present++; if (lateMinutes > 0) summary.late++; break;
        case "A": summary.absent++; break;
        case "L": summary.leave++; break;
        case "HD": summary.halfDay++; break;
        case "WFH": summary.wfh++; break;
        case "OD": summary.onDuty++; break;
        case "WO": summary.weeklyOff++; break;
        case "H": summary.holiday++; break;
        case "MP": summary.missingPunch++; break;
        default: break;
      }
      if (["P", "WFH", "OD", "HD"].includes(status) && !isFuture) {
        totalMinutes += workedMinutes;
        countedDays++;
        overtimeTotal += overtimeMinutes;
      }

      outDays.push({
        date: d.toISOString(),
        dayName: DAY_NAMES[d.getUTCDay()],
        status,
        statusLabel: ATTENDANCE_STATUS_LABELS[status] ?? status,
        state: row?.state ?? "NOT_STARTED",
        firstCheckIn: firstCheckIn?.toISOString() ?? null,
        lastCheckOut: lastCheckOut?.toISOString() ?? null,
        workedMinutes,
        breakMinutes,
        overtimeMinutes,
        lateMinutes,
        shiftName: shift?.name ?? null,
        regularized: row?.regularized ?? false,
        hasRecord: !!row,
      });
    }

    summary.averageMinutes = countedDays > 0 ? Math.round(totalMinutes / countedDays) : 0;
    summary.overtimeMinutes = overtimeTotal;
    summary.payableDays =
      summary.present + summary.wfh + summary.onDuty + summary.halfDay * 0.5 + summary.holiday;

    return ok({ year, month, days: outDays, summary });
  } catch (err) {
    return serverError(err);
  }
}
