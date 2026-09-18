import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, badRequest, serverError } from "@/lib/hrms/auth";
import { addDays, dayIST } from "@/lib/hrms/time";

export const dynamic = "force-dynamic";

interface CalEvent {
  id: string;
  title: string;
  type: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  organizer: string | null;
  attendees: string | null;
}

function dayISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Last working day (Mon–Fri) of the given month. */
function lastWorkingDay(year: number, month: number): Date {
  let d = new Date(Date.UTC(year, month, 0)); // month is 1-based; day 0 = last day of previous
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d = addDays(d, -1);
  }
  return d;
}

/** Collect all calendar-visible events overlapping [startDay, endDay) (UTC-midnight days). */
async function loadEvents(
  employeeId: string,
  companyId: string | null,
  startDay: Date,
  endDay: Date
): Promise<CalEvent[]> {
  const startInstant = startDay.getTime();
  const endInstant = endDay.getTime();
  const events: CalEvent[] = [];

  // 1. Calendar events — own + company-wide
  const calEvents = await db.calendarEvent.findMany({
    where: {
      AND: [
        {
          OR: [
            { employeeId },
            { employeeId: null, ...(companyId ? { companyId } : { companyId: null }) },
          ],
        },
        { startAt: { lt: new Date(endInstant) } },
        { OR: [{ endAt: null }, { endAt: { gte: new Date(startInstant) } }] },
      ],
    },
    take: 500,
  });
  for (const e of calEvents) {
    events.push({
      id: e.id,
      title: e.title,
      type: e.type,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt ? e.endAt.toISOString() : null,
      allDay: e.allDay,
      location: e.location,
      organizer: e.organizer,
      attendees: e.attendees || null,
    });
  }

  // 2. Approved leave — all-day "On Leave"
  const leaves = await db.leaveRequest.findMany({
    where: {
      employeeId,
      status: "APPROVED",
      fromDate: { lt: endDay },
      toDate: { gte: startDay },
    },
  });
  for (const l of leaves) {
    events.push({
      id: `leave-${l.id}`,
      title: "On Leave",
      type: "LEAVE",
      startAt: `${dayISO(l.fromDate)}T00:00:00.000Z`,
      endAt: `${dayISO(l.toDate)}T23:59:00.000Z`,
      allDay: true,
      location: null,
      organizer: null,
      attendees: null,
    });
  }

  // 3. Own non-completed task due dates
  const tasks = await db.task.findMany({
    where: {
      employeeId,
      status: { not: "COMPLETED" },
      dueAt: { not: null, gte: new Date(startInstant), lt: new Date(endInstant) },
    },
  });
  for (const t of tasks) {
    events.push({
      id: `task-${t.id}`,
      title: t.title,
      type: "TASK",
      startAt: (t.dueAt as Date).toISOString(),
      endAt: null,
      allDay: false,
      location: null,
      organizer: t.assignedBy,
      attendees: null,
    });
  }

  // 4. Holidays + 5. payroll day for each month overlapping the range
  const holidays = await db.holiday.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      date: { gte: startDay, lt: endDay },
    },
  });
  for (const h of holidays) {
    events.push({
      id: `holiday-${h.id}`,
      title: h.name,
      type: "HOLIDAY",
      startAt: `${dayISO(h.date)}T00:00:00.000Z`,
      endAt: null,
      allDay: true,
      location: null,
      organizer: null,
      attendees: null,
    });
  }

  const months: { y: number; m: number }[] = [];
  let cursor = new Date(Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(endDay.getUTCFullYear(), endDay.getUTCMonth(), 1));
  while (cursor <= endMonth) {
    months.push({ y: cursor.getUTCFullYear(), m: cursor.getUTCMonth() + 1 });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  for (const { y, m } of months) {
    const payDay = lastWorkingDay(y, m);
    if (payDay >= startDay && payDay < endDay) {
      events.push({
        id: `payroll-${y}-${String(m).padStart(2, "0")}`,
        title: "Salary credit — payroll processing",
        type: "PAYROLL",
        startAt: `${dayISO(payDay)}T00:00:00.000Z`,
        endAt: null,
        allDay: true,
        location: null,
        organizer: null,
        attendees: null,
      });
    }
  }

  return events;
}

/** Bucket events into IST day keys, clamped to [startDay, endDay). */
function bucketByDay(events: CalEvent[], startDay: Date, endDay: Date): Record<string, CalEvent[]> {
  const days: Record<string, CalEvent[]> = {};
  for (const e of events) {
    const startD = dayIST(new Date(e.startAt));
    const endD = e.endAt ? dayIST(new Date(e.endAt)) : startD;
    let d = startD;
    let guard = 0;
    while (d <= endD && guard < 400) {
      if (d >= startDay && d < endDay) {
        const key = dayISO(d);
        (days[key] ??= []).push(e);
      }
      d = addDays(d, 1);
      guard++;
    }
  }
  for (const key of Object.keys(days)) {
    days[key].sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startAt.localeCompare(b.startAt);
    });
  }
  return days;
}

export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();

    const url = new URL(req.url);
    const today = dayIST();
    const yearParam = url.searchParams.get("year");
    const monthParam = url.searchParams.get("month");
    const year = yearParam ? Number(yearParam) : today.getUTCFullYear();
    const month = monthParam ? Number(monthParam) : today.getUTCMonth() + 1;
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return badRequest("VALIDATION_ERROR", "year and month must be valid calendar values.");
    }

    const companyId = auth.employee.companyId;
    const rangeStart = new Date(Date.UTC(year, month - 1, 1));
    const rangeEnd = new Date(Date.UTC(year, month, 1));

    // ── events for the requested month ─────────────────────
    const events = await loadEvents(auth.employee.id, companyId, rangeStart, rangeEnd);
    const days = bucketByDay(events, rangeStart, rangeEnd);

    // ── holidays in month ──────────────────────────────────
    const holidays = await db.holiday.findMany({
      where: { ...(companyId ? { companyId } : {}), date: { gte: rangeStart, lt: rangeEnd } },
      orderBy: { date: "asc" },
    });

    // ── birthdays & work anniversaries (same company) ──────
    const coworkers = await db.employee.findMany({
      where: { companyId, status: { not: "SEPARATED" } },
      select: { firstName: true, lastName: true, designation: true, dateOfBirth: true, dateOfJoining: true, dateOfBirthPublic: true },
    });
    const birthdays: { date: string; name: string; designation: string }[] = [];
    const anniversaries: { date: string; name: string; years: number; designation: string }[] = [];
    for (const c of coworkers) {
      const name = `${c.firstName} ${c.lastName}`;
      if (c.dateOfBirth && c.dateOfBirthPublic) {
        const dob = c.dateOfBirth;
        if (dob.getUTCMonth() + 1 === month) {
          const date = dayISO(new Date(Date.UTC(year, month - 1, dob.getUTCDate())));
          birthdays.push({ date, name, designation: c.designation });
        }
      }
      const doj = c.dateOfJoining;
      if (doj.getUTCMonth() + 1 === month) {
        const annivYear = year;
        const years = annivYear - doj.getUTCFullYear();
        if (years >= 1) {
          const date = dayISO(new Date(Date.UTC(annivYear, month - 1, doj.getUTCDate())));
          anniversaries.push({ date, name, years, designation: c.designation });
        }
      }
    }
    birthdays.sort((a, b) => a.date.localeCompare(b.date));
    anniversaries.sort((a, b) => a.date.localeCompare(b.date));

    // add celebrations to the day buckets as chips
    for (const b of birthdays) {
      (days[b.date] ??= []).push({
        id: `birthday-${b.date}-${b.name.replace(/\s+/g, "-").toLowerCase()}`,
        title: `${b.name} — Birthday`,
        type: "BIRTHDAY",
        startAt: `${b.date}T00:00:00.000Z`,
        endAt: null,
        allDay: true,
        location: null,
        organizer: null,
        attendees: null,
      });
    }
    for (const a of anniversaries) {
      (days[a.date] ??= []).push({
        id: `anniversary-${a.date}-${a.name.replace(/\s+/g, "-").toLowerCase()}`,
        title: `${a.name} — ${a.years}y Work Anniversary`,
        type: "ANNIVERSARY",
        startAt: `${a.date}T00:00:00.000Z`,
        endAt: null,
        allDay: true,
        location: null,
        organizer: null,
        attendees: null,
      });
    }
    for (const key of Object.keys(days)) {
      days[key].sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.startAt.localeCompare(b.startAt);
      });
    }

    // ── upcoming agenda: next 7 days from today ────────────
    const upcomingStart = today;
    const upcomingEnd = addDays(today, 7);
    const upcomingEvents = await loadEvents(auth.employee.id, companyId, upcomingStart, upcomingEnd);
    const upcomingDays = bucketByDay(upcomingEvents, upcomingStart, upcomingEnd);
    const upcoming: { date: string; events: CalEvent[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const key = dayISO(addDays(upcomingStart, i));
      if (upcomingDays[key]?.length) upcoming.push({ date: key, events: upcomingDays[key] });
    }

    return ok({
      year,
      month,
      days,
      holidays: holidays.map((h) => ({ date: dayISO(h.date), name: h.name, type: h.type })),
      birthdays,
      anniversaries,
      upcoming,
      today: dayISO(today),
    });
  } catch (err) {
    return serverError(err);
  }
}
