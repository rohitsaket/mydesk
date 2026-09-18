// Attendance engine — backend-authoritative calculations and state machine.
// States: NOT_STARTED → WORKING → ON_BREAK → WORKING → CHECKED_OUT

import { db } from "@/lib/db";
import type { AttendanceDay, AttendanceEvent, Employee, Shift } from "@prisma/client";
import {
  dayIST, minutesBetween, shiftStartAbsolute, shiftEndAbsolute, parseHHMM,
  BREAK_TYPE_LABELS, ATTENDANCE_STATUS_LABELS,
} from "./time";
import type { AttendanceToday, TimelineEvent } from "./types";

// ── shift resolution ─────────────────────────────────────────
export async function resolveShiftForDay(employeeId: string, day: Date): Promise<Shift | null> {
  const assignment = await db.shiftAssignment.findFirst({
    where: { employeeId, date: day },
    include: { shift: true },
  });
  if (assignment) return assignment.shift;
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return null;
  const any = await db.shift.findFirst({ where: { code: "GEN" } });
  return any;
}

export async function getOrCreateDay(employee: Employee, date: Date): Promise<{ day: AttendanceDay; shift: Shift | null }> {
  const day = dayIST(date);
  let row = await db.attendanceDay.findUnique({
    where: { employeeId_date: { employeeId: employee.id, date: day } },
  });
  const shift = await resolveShiftForDay(employee.id, day);
  if (!row) {
    // status: check leave / duty / holiday / weekly off
    const status = await deriveBaseStatus(employee.id, day, shift);
    row = await db.attendanceDay.create({
      data: {
        employeeId: employee.id,
        date: day,
        shiftId: shift?.id ?? null,
        state: "NOT_STARTED",
        status,
        requiredMinutes: shift?.requiredMinutes ?? 510,
      },
    });
  }
  return { day: row, shift };
}

async function deriveBaseStatus(employeeId: string, day: Date, shift: Shift | null): Promise<string> {
  const dow = day.getUTCDay();
  const weeklyOff = (shift?.weeklyOff ?? "0").split(",").map((x) => parseInt(x, 10));
  if (weeklyOff.includes(dow)) return "WO";

  const holiday = await db.holiday.findFirst({ where: { date: day } });
  if (holiday) return "H";

  const leave = await db.leaveRequest.findFirst({
    where: {
      employeeId, status: "APPROVED",
      fromDate: { lte: day }, toDate: { gte: day },
    },
  });
  if (leave) return "L";

  const wfh = await db.dutyRequest.findFirst({
    where: { employeeId, type: "WFH", status: "APPROVED", fromDate: { lte: addDaysEnd(day) }, toDate: { gte: day } },
  });
  if (wfh) return "WFH";

  const od = await db.dutyRequest.findFirst({
    where: { employeeId, type: "ON_DUTY", status: "APPROVED", fromDate: { lte: addDaysEnd(day) }, toDate: { gte: day } },
  });
  if (od) return "OD";

  return "PENDING";
}

function addDaysEnd(day: Date): Date {
  return new Date(day.getTime() + 86399999);
}

// ── live computation ─────────────────────────────────────────
export interface ComputedBreak {
  type: string;
  breakType: string | null;
  timestamp: Date;
  endedAt: Date | null;
  durationMinutes: number;
}

export function computeBreaks(events: AttendanceEvent[], now: Date): ComputedBreak[] {
  const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const breaks: ComputedBreak[] = [];
  let open: AttendanceEvent | null = null;
  for (const ev of sorted) {
    if (ev.type === "BREAK_START") {
      open = ev;
    } else if (ev.type === "BREAK_END" && open) {
      breaks.push({
        type: "BREAK",
        breakType: open.breakType,
        timestamp: open.timestamp,
        endedAt: ev.timestamp,
        durationMinutes: minutesBetween(open.timestamp, ev.timestamp),
      });
      open = null;
    }
  }
  if (open) {
    breaks.push({
      type: "BREAK",
      breakType: open.breakType,
      timestamp: open.timestamp,
      endedAt: null,
      durationMinutes: minutesBetween(open.timestamp, now),
    });
  }
  return breaks;
}

export function computeWorkedMinutes(day: AttendanceDay, breaks: ComputedBreak[], now: Date): { gross: number; net: number; breakMinutes: number } {
  if (!day.firstCheckIn) return { gross: 0, net: 0, breakMinutes: 0 };
  const endRef = day.lastCheckOut ?? (day.state === "CHECKED_OUT" ? day.lastCheckOut ?? now : now);
  const gross = minutesBetween(day.firstCheckIn, endRef);
  const breakMinutes = breaks.reduce((a, b) => a + b.durationMinutes, 0);
  return { gross, net: Math.max(0, gross - breakMinutes), breakMinutes };
}

export async function buildAttendanceToday(employee: Employee, now = new Date()): Promise<AttendanceToday> {
  const { day, shift } = await getOrCreateDay(employee, now);
  const events = await db.attendanceEvent.findMany({ where: { dayId: day.id }, orderBy: { timestamp: "asc" } });
  const breaks = computeBreaks(events, now);
  const { net, breakMinutes } = computeWorkedMinutes(day, breaks, now);

  const required = day.requiredMinutes || shift?.requiredMinutes || 510;
  const overtime = Math.max(0, net - required);
  const remaining = Math.max(0, required - net);

  const dayLocal = dayIST(now);
  const shiftStart = shift ? shiftStartAbsolute(dayLocal, shift.startTime) : null;
  const shiftEnd = shift ? shiftEndAbsolute(dayLocal, shift.startTime, shift.endTime) : null;

  let lateMinutes = 0;
  if (day.firstCheckIn && shift && shiftStart) {
    lateMinutes = Math.max(0, minutesBetween(shiftStart, day.firstCheckIn) - shift.graceMinutes);
  }
  let earlyMinutes = 0;
  if (day.lastCheckOut && shift && shiftEnd) {
    earlyMinutes = Math.max(0, minutesBetween(day.lastCheckOut, shiftEnd));
  }

  const currentBreak = breaks.find((b) => !b.endedAt) ?? null;

  // progress across the shift window
  let progressPercent = 0;
  if (shiftStart && shiftEnd && day.firstCheckIn) {
    const totalWindow = Math.max(1, shiftEnd.getTime() - shiftStart.getTime());
    const elapsed = Math.min(Math.max(0, now.getTime() - day.firstCheckIn.getTime()), totalWindow);
    progressPercent = Math.round((elapsed / totalWindow) * 100);
  }

  // timeline
  const timeline: TimelineEvent[] = events.map((ev) => {
    const isStart = ev.type === "BREAK_START";
    const isEnd = ev.type === "BREAK_END";
    return {
      id: ev.id,
      type: ev.type as TimelineEvent["type"],
      label:
        ev.type === "CHECK_IN" ? "Checked In" :
        ev.type === "CHECK_OUT" ? "Checked Out" :
        isStart ? `${BREAK_TYPE_LABELS[ev.breakType ?? ""] ?? "Break"} Started` :
        "Resumed Work",
      timestamp: ev.timestamp.toISOString(),
      breakType: ev.breakType,
      source: ev.source,
    };
  });
  if (shiftEnd && day.state !== "CHECKED_OUT" && day.state !== "NOT_STARTED") {
    timeline.push({
      id: "expected",
      type: "CHECK_OUT",
      label: "Expected Checkout",
      timestamp: shiftEnd.toISOString(),
      pending: true,
    });
  }

  const statusLabel = day.state === "NOT_STARTED"
    ? (ATTENDANCE_STATUS_LABELS[day.status] ?? "Not Checked In")
    : day.state === "ON_BREAK" ? "On Break"
    : day.state === "WORKING" ? (lateMinutes > 0 ? "Working (Late)" : "Working")
    : "Checked Out";

  let warning: string | null = null;
  if (currentBreak && shift && currentBreak.durationMinutes > shift.breakAllowanceMinutes) {
    warning = `Your ${BREAK_TYPE_LABELS[currentBreak.breakType ?? ""] ?? "break"} has exceeded the ${shift.breakAllowanceMinutes}-minute allowance. Please end your break.`;
  }
  if (day.state === "NOT_STARTED" && day.status === "PENDING" && now.getTime() > (shiftStart?.getTime() ?? 0) + 15 * 60000) {
    warning = "You have not checked in yet for today's shift.";
  }

  return {
    date: dayLocal.toISOString(),
    state: day.state as AttendanceToday["state"],
    status: day.status,
    statusLabel,
    serverTime: now.getTime(),
    firstCheckIn: day.firstCheckIn?.toISOString() ?? null,
    expectedCheckOut: shiftEnd?.toISOString() ?? null,
    lastCheckOut: day.lastCheckOut?.toISOString() ?? null,
    shift: shift ? {
      id: shift.id, name: shift.name, code: shift.code,
      startTime: shift.startTime, endTime: shift.endTime,
      shiftType: shift.shiftType,
      graceMinutes: shift.graceMinutes,
      breakAllowanceMinutes: shift.breakAllowanceMinutes,
      requiredMinutes: shift.requiredMinutes,
      crossesMidnight: parseHHMM(shift.endTime) <= parseHHMM(shift.startTime),
    } : null,
    workedMinutes: net,
    breakMinutes,
    requiredMinutes: required,
    remainingMinutes: remaining,
    overtimeMinutes: overtime,
    lateMinutes,
    earlyMinutes,
    progressPercent: Math.min(100, progressPercent),
    currentBreak: currentBreak ? {
      breakType: currentBreak.breakType ?? "CUSTOM",
      label: BREAK_TYPE_LABELS[currentBreak.breakType ?? ""] ?? "Custom Break",
      startedAt: currentBreak.timestamp.toISOString(),
      durationMinutes: currentBreak.durationMinutes,
      exceeded: shift ? currentBreak.durationMinutes > shift.breakAllowanceMinutes : false,
    } : null,
    breaks: breaks.map((b) => ({
      type: b.type,
      breakType: b.breakType,
      timestamp: b.timestamp.toISOString(),
      endedAt: b.endedAt?.toISOString() ?? null,
      durationMinutes: b.durationMinutes,
    })),
    timeline,
    source: day.checkInSource,
    deviceInfo: day.deviceInfo,
    warning,
  };
}

// ── state machine actions ────────────────────────────────────
export class AttendanceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function checkIn(employee: Employee, source: string, deviceInfo: string, now = new Date()) {
  const { day, shift } = await getOrCreateDay(employee, now);

  if (day.status === "L" || day.status === "H" || day.status === "WO" || day.status === "OD") {
    throw new AttendanceError(
      "ATTENDANCE_NOT_APPLICABLE",
      `Today is marked as ${ATTENDANCE_STATUS_LABELS[day.status] ?? day.status}. Check-in is not applicable.`
    );
  }
  if (day.state !== "NOT_STARTED") {
    throw new AttendanceError("ATTENDANCE_ALREADY_CHECKED_IN", "You are already checked in.");
  }

  const dayLocal = dayIST(now);
  const shiftStart = shift ? shiftStartAbsolute(dayLocal, shift.startTime) : null;
  let lateMinutes = 0;
  if (shiftStart && shift) {
    lateMinutes = Math.max(0, minutesBetween(shiftStart, now) - shift.graceMinutes);
  }

  const updated = await db.attendanceDay.update({
    where: { id: day.id },
    data: {
      state: "WORKING",
      status: "P",
      firstCheckIn: now,
      checkInSource: source,
      deviceInfo,
      lateMinutes,
      requiredMinutes: shift?.requiredMinutes ?? day.requiredMinutes,
    },
  });

  await db.attendanceEvent.create({
    data: { employeeId: employee.id, dayId: day.id, type: "CHECK_IN", timestamp: now, source, device: deviceInfo },
  });

  return { day: updated, shift, lateMinutes };
}

export async function startBreak(employee: Employee, breakType: string, now = new Date()) {
  const { day } = await getOrCreateDay(employee, now);
  if (day.state === "NOT_STARTED") {
    throw new AttendanceError("ATTENDANCE_NOT_CHECKED_IN", "You must check in before taking a break.");
  }
  if (day.state === "CHECKED_OUT") {
    throw new AttendanceError("ATTENDANCE_ALREADY_CHECKED_OUT", "You have already checked out for the day.");
  }
  if (day.state === "ON_BREAK") {
    throw new AttendanceError("ATTENDANCE_ALREADY_ON_BREAK", "You are already on a break.");
  }

  await db.attendanceDay.update({ where: { id: day.id }, data: { state: "ON_BREAK" } });
  await db.attendanceEvent.create({
    data: { employeeId: employee.id, dayId: day.id, type: "BREAK_START", breakType, timestamp: now, source: "WEB" },
  });
  return day;
}

export async function endBreak(employee: Employee, now = new Date()) {
  const { day } = await getOrCreateDay(employee, now);
  if (day.state !== "ON_BREAK") {
    throw new AttendanceError("ATTENDANCE_NO_ACTIVE_BREAK", "You do not have an active break to end.");
  }
  const openStart = await db.attendanceEvent.findFirst({
    where: { dayId: day.id, type: "BREAK_START" },
    orderBy: { timestamp: "desc" },
  });
  // find the latest BREAK_START without a matching BREAK_END
  const events = await db.attendanceEvent.findMany({ where: { dayId: day.id }, orderBy: { timestamp: "asc" } });
  let open: typeof openStart = null;
  for (const ev of events) {
    if (ev.type === "BREAK_START") open = ev;
    else if (ev.type === "BREAK_END") open = null;
  }

  await db.attendanceDay.update({ where: { id: day.id }, data: { state: "WORKING" } });
  await db.attendanceEvent.create({
    data: { employeeId: employee.id, dayId: day.id, type: "BREAK_END", breakType: open?.breakType ?? null, timestamp: now, source: "WEB" },
  });
  return day;
}

export async function checkOut(employee: Employee, reason: string | null, source: string, now = new Date()) {
  const { day, shift } = await getOrCreateDay(employee, now);
  if (day.state === "NOT_STARTED") {
    throw new AttendanceError("ATTENDANCE_NOT_CHECKED_IN", "You have not checked in today.");
  }
  if (day.state === "CHECKED_OUT") {
    throw new AttendanceError("ATTENDANCE_ALREADY_CHECKED_OUT", "You have already checked out for the day.");
  }

  // auto-close an open break
  if (day.state === "ON_BREAK") {
    await endBreak(employee, now);
  }

  const events = await db.attendanceEvent.findMany({ where: { dayId: day.id } });
  const breaks = computeBreaks(events, now);
  const gross = minutesBetween(day.firstCheckIn!, now);
  const breakMinutes = breaks.reduce((a, b) => a + b.durationMinutes, 0);
  const net = Math.max(0, gross - breakMinutes);
  const required = day.requiredMinutes || 510;
  const overtime = Math.max(0, net - required);

  const dayLocal = dayIST(now);
  const shiftEnd = shift ? shiftEndAbsolute(dayLocal, shift.startTime, shift.endTime) : null;
  const earlyMinutes = shiftEnd ? Math.max(0, minutesBetween(now, shiftEnd)) : 0;

  let status = "P";
  if (net < 240) status = "HD"; // half day threshold: 4h
  if (day.status === "WFH") status = "WFH";

  const updated = await db.attendanceDay.update({
    where: { id: day.id },
    data: {
      state: "CHECKED_OUT",
      status,
      lastCheckOut: now,
      checkOutSource: source,
      grossMinutes: gross,
      netMinutes: net,
      breakMinutes,
      overtimeMinutes: overtime,
      earlyMinutes,
      remark: reason,
    },
  });
  await db.attendanceEvent.create({
    data: { employeeId: employee.id, dayId: day.id, type: "CHECK_OUT", timestamp: now, source, device: source },
  });

  return { day: updated, net, gross, breakMinutes, required, remaining: Math.max(0, required - net), overtime, earlyMinutes };
}

export async function notify(employeeId: string, title: string, body: string, type: string, link?: string) {
  await db.notification.create({
    data: { employeeId, title, body, type, link: link ?? null },
  });
}
