import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, badRequest, serverError, audit } from "@/lib/hrms/auth";
import { addDays, dayIST } from "@/lib/hrms/time";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MS_PER_DAY = 86400000;

/** Monday (org-local, UTC-midnight) of the week containing `day` (UTC-midnight). */
function weekMonday(day: Date): Date {
  return addDays(day, -((day.getUTCDay() + 6) % 7));
}

function dateISO(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** Parse "YYYY-MM-DD" to a UTC-midnight Date; returns null when invalid. */
function parseDay(s: unknown): Date | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface EntryRow {
  id: string; date: Date; weekStart: Date; project: string; taskName: string | null;
  description: string | null; startMinutes: number; endMinutes: number; minutes: number;
  billable: boolean; status: string; decisionNote: string | null;
}

function serializeEntry(e: EntryRow) {
  return {
    id: e.id,
    date: dateISO(e.date),
    project: e.project,
    taskName: e.taskName,
    description: e.description,
    startMinutes: e.startMinutes,
    endMinutes: e.endMinutes,
    minutes: e.minutes,
    billable: e.billable,
    status: e.status,
  };
}

function buildWeek(weekStart: Date, entries: EntryRow[]) {
  const days: { date: string; entries: ReturnType<typeof serializeEntry>[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    days.push({
      date: dateISO(day),
      entries: entries
        .filter((e) => e.date.getTime() === day.getTime())
        .sort((a, b) => a.startMinutes - b.startMinutes)
        .map(serializeEntry),
    });
  }

  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);
  const billableMinutes = entries.reduce((s, e) => s + (e.billable ? e.minutes : 0), 0);
  const byProjectMap = new Map<string, number>();
  for (const e of entries) byProjectMap.set(e.project, (byProjectMap.get(e.project) ?? 0) + e.minutes);
  const byProject = [...byProjectMap.entries()]
    .map(([project, minutes]) => ({ project, minutes }))
    .sort((a, b) => b.minutes - a.minutes);

  // week status: REJECTED > APPROVED (all) > SUBMITTED > DRAFT
  const statuses = new Set(entries.map((e) => e.status));
  let weekStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" = "DRAFT";
  let rejectionNote: string | null = null;
  if (entries.length === 0) {
    weekStatus = "DRAFT";
  } else if (statuses.has("REJECTED")) {
    weekStatus = "REJECTED";
    rejectionNote = entries.find((e) => e.status === "REJECTED")?.decisionNote ?? null;
  } else if (statuses.size === 1 && statuses.has("APPROVED")) {
    weekStatus = "APPROVED";
  } else if (statuses.has("SUBMITTED")) {
    weekStatus = "SUBMITTED";
  }

  return {
    weekStart: dateISO(weekStart),
    weekEnd: dateISO(addDays(weekStart, 6)),
    days,
    totals: { minutes: totalMinutes, billableMinutes, byProject },
    weekStatus,
    rejectionNote,
    counts: {
      draft: entries.filter((e) => e.status === "DRAFT").length,
      submitted: entries.filter((e) => e.status === "SUBMITTED").length,
    },
  };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();

    const url = new URL(req.url);
    const wsParam = url.searchParams.get("weekStart");
    let weekStart: Date;
    if (wsParam) {
      const parsed = parseDay(wsParam);
      if (!parsed) return badRequest("VALIDATION_ERROR", "weekStart must be a valid YYYY-MM-DD date.");
      weekStart = weekMonday(parsed);
    } else {
      weekStart = weekMonday(dayIST());
    }

    const entries = await db.timesheetEntry.findMany({
      where: { employeeId: auth.employee.id, weekStart },
      orderBy: [{ date: "asc" }, { startMinutes: "asc" }],
    });

    return ok(buildWeek(weekStart, entries as unknown as EntryRow[]));
  } catch (err) {
    return serverError(err);
  }
}

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  project: z.string().trim().min(1, "Project is required").max(100),
  taskName: z.string().trim().max(150).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  startMinutes: z.number().int().min(0).max(1440),
  endMinutes: z.number().int().min(0).max(1440),
  billable: z.boolean().default(true),
});

const submitSchema = z.object({
  action: z.literal("submit-week"),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD"),
});

export async function POST(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();

    const body = await req.json().catch(() => null);
    if (body && typeof body === "object" && "action" in body && body.action === "submit-week") {
      const parsed = submitSchema.safeParse(body);
      if (!parsed.success) {
        return badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid submit payload.");
      }
      const day = parseDay(parsed.data.weekStart);
      if (!day) return badRequest("VALIDATION_ERROR", "weekStart must be a valid date.");
      const weekStart = weekMonday(day);

      const drafts = await db.timesheetEntry.findMany({
        where: { employeeId: auth.employee.id, weekStart, status: "DRAFT" },
      });
      if (drafts.length === 0) {
        return badRequest("NO_DRAFT_ENTRIES", "No draft entries to submit for this week.");
      }

      const now = new Date();
      await db.timesheetEntry.updateMany({
        where: { id: { in: drafts.map((d) => d.id) } },
        data: { status: "SUBMITTED", submittedAt: now },
      });
      await audit(
        auth.employee,
        "TIMESHEET_WEEK_SUBMITTED",
        "TimesheetEntry",
        weekStart.toISOString().slice(0, 10),
        `${drafts.length} entries submitted for approval`
      );
      return ok({ submitted: drafts.length });
    }

    const parsed = entrySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid timesheet entry.");
    }
    const data = parsed.data;

    const date = parseDay(data.date);
    if (!date) return badRequest("VALIDATION_ERROR", "date must be a valid YYYY-MM-DD date.");
    if (data.endMinutes <= data.startMinutes) {
      return badRequest("VALIDATION_ERROR", "End time must be after start time.");
    }

    const weekStart = weekMonday(date);
    const entry = await db.timesheetEntry.create({
      data: {
        employeeId: auth.employee.id,
        date,
        weekStart,
        project: data.project,
        taskName: data.taskName?.trim() ? data.taskName : null,
        description: data.description?.trim() ? data.description : null,
        startMinutes: data.startMinutes,
        endMinutes: data.endMinutes,
        minutes: data.endMinutes - data.startMinutes,
        billable: data.billable,
        status: "DRAFT",
      },
    });

    await audit(auth.employee, "TIMESHEET_ENTRY_CREATED", "TimesheetEntry", entry.id, `${data.project} · ${Math.round((data.endMinutes - data.startMinutes) / 6) / 10}h`);
    return ok(serializeEntry(entry as unknown as EntryRow));
  } catch (err) {
    return serverError(err);
  }
}
