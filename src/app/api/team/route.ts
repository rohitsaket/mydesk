import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, forbidden, serverError, isManagerOrAbove } from "@/lib/hrms/auth";
import { computeBreaks } from "@/lib/hrms/attendance";
import { dayIST, minutesBetween, ATTENDANCE_STATUS_LABELS } from "@/lib/hrms/time";

export const dynamic = "force-dynamic";

interface TeamMember {
  id: string;
  empCode: string;
  name: string;
  designation: string;
  department: string | null;
  state: string;
  status: string;
  statusLabel: string;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  workedMinutes: number;
  breakMinutes: number;
  shiftName: string;
  overtimeMinutes: number;
  badge: { status: string; label: string };
}

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;
    if (!isManagerOrAbove(emp.role)) {
      return forbidden("Team view requires a manager role.");
    }

    const now = new Date();
    const today = dayIST(now);

    const reports = await db.employee.findMany({
      where: { managerId: emp.id },
      include: { department: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    const reportIds = reports.map((r) => r.id);
    const days = reportIds.length
      ? await db.attendanceDay.findMany({
          where: { employeeId: { in: reportIds }, date: today },
          include: { shift: true },
        })
      : [];

    // live members need their event log to compute worked/break minutes up to now
    const liveDayIds = days
      .filter((d) => d.firstCheckIn && d.state !== "CHECKED_OUT")
      .map((d) => d.id);
    const liveEvents = liveDayIds.length
      ? await db.attendanceEvent.findMany({
          where: { dayId: { in: liveDayIds } },
          orderBy: { timestamp: "asc" },
        })
      : [];
    const eventsByDay = new Map<string, typeof liveEvents>();
    for (const ev of liveEvents) {
      const list = eventsByDay.get(ev.dayId) ?? [];
      list.push(ev);
      eventsByDay.set(ev.dayId, list);
    }

    // shift fallback from the roster for members without a day row yet
    const noDayIds = reportIds.filter((id) => !days.some((d) => d.employeeId === id));
    const assignments = noDayIds.length
      ? await db.shiftAssignment.findMany({
          where: { employeeId: { in: noDayIds }, date: today },
          include: { shift: true },
        })
      : [];

    const members: TeamMember[] = reports.map((r) => {
      const day = days.find((d) => d.employeeId === r.id) ?? null;
      const shiftName =
        day?.shift?.name ??
        assignments.find((a) => a.employeeId === r.id)?.shift.name ??
        "General Shift";

      let workedMinutes = 0;
      let breakMinutes = 0;
      let overtimeMinutes = 0;
      if (day) {
        if (day.firstCheckIn && day.state !== "CHECKED_OUT") {
          const events = eventsByDay.get(day.id) ?? [];
          const breaks = computeBreaks(events, now);
          const gross = minutesBetween(day.firstCheckIn, now);
          breakMinutes = breaks.reduce((a, b) => a + b.durationMinutes, 0);
          workedMinutes = Math.max(0, gross - breakMinutes);
          overtimeMinutes = Math.max(0, workedMinutes - (day.requiredMinutes || 510));
        } else {
          workedMinutes = day.netMinutes;
          breakMinutes = day.breakMinutes;
          overtimeMinutes = day.overtimeMinutes;
        }
      }

      const state = day?.state ?? "NOT_STARTED";
      const status = day?.status ?? "PENDING";
      // one-glance badge for the roster
      let badge: { status: string; label: string };
      if (status === "L") badge = { status: "L", label: "Leave" };
      else if (status === "WFH") badge = { status: "WFH", label: "WFH" };
      else if (status === "OD") badge = { status: "OD", label: "On Duty" };
      else if (status === "H") badge = { status: "H", label: "Holiday" };
      else if (status === "WO") badge = { status: "WO", label: "Weekly Off" };
      else if (state === "WORKING") badge = { status: "WORKING", label: "Working" };
      else if (state === "ON_BREAK") badge = { status: "ON_BREAK", label: "On Break" };
      else if (state === "CHECKED_OUT") badge = { status: "CHECKED_OUT", label: "Checked Out" };
      else badge = { status: "NOT_STARTED", label: "Not Checked In" };

      return {
        id: r.id,
        empCode: r.empCode,
        name: `${r.firstName} ${r.lastName}`,
        designation: r.designation,
        department: r.department?.name ?? null,
        state,
        status,
        statusLabel: ATTENDANCE_STATUS_LABELS[status] ?? status,
        firstCheckIn: day?.firstCheckIn?.toISOString() ?? null,
        lastCheckOut: day?.lastCheckOut?.toISOString() ?? null,
        workedMinutes,
        breakMinutes,
        shiftName,
        overtimeMinutes,
        badge,
      };
    });

    const checkedIn = members.filter((m) => m.firstCheckIn);
    const summary = {
      total: members.length,
      working: members.filter((m) => m.badge.status === "WORKING").length,
      onBreak: members.filter((m) => m.badge.status === "ON_BREAK").length,
      leave: members.filter((m) => m.badge.status === "L").length,
      wfh: members.filter((m) => m.badge.status === "WFH").length,
      notCheckedIn: members.filter((m) => m.badge.status === "NOT_STARTED").length,
      checkedOut: members.filter((m) => m.badge.status === "CHECKED_OUT").length,
      avgMinutes: checkedIn.length
        ? Math.round(checkedIn.reduce((a, m) => a + m.workedMinutes, 0) / checkedIn.length)
        : 0,
    };

    return ok({ date: today.toISOString(), members, summary });
  } catch (err) {
    return serverError(err);
  }
}
