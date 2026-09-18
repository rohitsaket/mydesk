import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError } from "@/lib/hrms/auth";
import { dayIST, addDays } from "@/lib/hrms/time";

export const dynamic = "force-dynamic";

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Minutes-of-day (IST) for an absolute timestamp. */
function istMinutesOfDay(d: Date): number {
  return Math.floor((((d.getTime() + IST_OFFSET_MS) % 86400000) + 86400000) % 86400000 / 60000);
}

function fmtHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Monday of the ISO week containing `d`. */
function weekStart(day: Date): Date {
  const dow = day.getUTCDay(); // 0=Sun
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(day, -back);
}

const WORKING_STATUSES = new Set(["P", "WFH", "OD", "HD"]);

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const empId = auth.employee.id;

    const today = dayIST();
    const from30 = addDays(today, -29);

    // ── parallel pulls ─────────────────────────────────────────
    const [dayRows, tasks, timesheets, balances, leaveTypes, payslips] = await Promise.all([
      db.attendanceDay.findMany({
        where: { employeeId: empId, date: { gte: from30, lte: today } },
        orderBy: { date: "asc" },
      }),
      db.task.findMany({
        where: { employeeId: empId },
        select: { status: true, createdAt: true, completedAt: true, dueAt: true },
      }),
      db.timesheetEntry.findMany({
        where: { employeeId: empId, weekStart: { gte: addDays(weekStart(today), -35) } },
        select: { project: true, minutes: true, billable: true },
      }),
      db.leaveBalance.findMany({
        where: { employeeId: empId, year: today.getUTCFullYear() },
        select: { entitled: true, used: true, pending: true, leaveTypeId: true },
      }),
      db.leaveType.findMany({
        select: { id: true, name: true, color: true },
      }),
      db.payslip.findMany({
        where: { employeeId: empId },
        orderBy: [{ period: { year: "asc" } }, { period: { month: "asc" } }],
        take: 3,
        select: { net: true, period: { select: { month: true, year: true } } },
      }),
    ]);

    // ── attendance trend + distribution ────────────────────────
    const byDate = new Map(dayRows.map((d) => [d.date.toISOString().slice(0, 10), d]));
    const trend: { date: string; label: string; hours: number; ot: number; status: string | null }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = addDays(today, -i);
      const key = d.toISOString().slice(0, 10);
      const row = byDate.get(key);
      trend.push({
        date: key,
        label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
        hours: row ? Math.round((row.grossMinutes / 60) * 10) / 10 : 0,
        ot: row ? Math.round((row.overtimeMinutes / 60) * 10) / 10 : 0,
        status: row?.status ?? null,
      });
    }

    const distribution: Record<string, number> = {};
    let workedDays = 0;
    let totalMinutes = 0;
    let totalOT = 0;
    for (const d of dayRows) {
      distribution[d.status] = (distribution[d.status] ?? 0) + 1;
      if (WORKING_STATUSES.has(d.status)) {
        workedDays++;
        totalMinutes += d.netMinutes;
        totalOT += d.overtimeMinutes;
      }
    }

    // ── punctuality ────────────────────────────────────────────
    const punched = dayRows.filter((d) => d.firstCheckIn);
    const onTime = punched.filter((d) => (d.lateMinutes ?? 0) <= 0).length;
    const avgLate = punched.length
      ? Math.round(punched.reduce((a, d) => a + (d.lateMinutes ?? 0), 0) / punched.length)
      : 0;
    const arrivals = punched.map((d) => istMinutesOfDay(d.firstCheckIn!)).sort((a, b) => a - b);
    const medianArrival = arrivals.length ? arrivals[Math.floor(arrivals.length / 2)] : null;
    const earlyExits = dayRows.filter((d) => (d.earlyMinutes ?? 0) > 0).length;

    // ── attendance streak (skips WO/H, ends at first gap) ──────
    let streak = 0;
    for (let i = 0; i < dayRows.length; i++) {
      const d = dayRows[dayRows.length - 1 - i];
      if (WORKING_STATUSES.has(d.status)) streak++;
      else if (d.status === "WO" || d.status === "H") continue;
      else break;
    }

    // ── task throughput (6 ISO weeks) ──────────────────────────
    const thisWeek = weekStart(today);
    const weekly: { week: string; created: number; completed: number }[] = [];
    for (let w = 5; w >= 0; w--) {
      const ws = addDays(thisWeek, -7 * w);
      const we = addDays(ws, 7);
      weekly.push({
        week: w === 0 ? "This wk" : w === 1 ? "Last wk" : `${ws.getUTCDate()}/${ws.getUTCMonth() + 1}`,
        created: tasks.filter((t) => t.createdAt >= ws && t.createdAt < we).length,
        completed: tasks.filter((t) => t.completedAt && t.completedAt >= ws && t.completedAt < we).length,
      });
    }
    const completed = tasks.filter((t) => t.status === "COMPLETED").length;
    const open = tasks.length - completed;
    const now = new Date();
    const overdue = tasks.filter((t) => t.status !== "COMPLETED" && t.dueAt && t.dueAt < now).length;

    // ── timesheet by project (6 weeks) ─────────────────────────
    const byProject = new Map<string, { hours: number; billable: number }>();
    let totalHours = 0;
    let billableHours = 0;
    for (const e of timesheets) {
      const h = e.minutes / 60;
      const key = e.project || "Other";
      const cur = byProject.get(key) ?? { hours: 0, billable: 0 };
      cur.hours += h;
      if (e.billable) cur.billable += h;
      byProject.set(key, cur);
      totalHours += h;
      if (e.billable) billableHours += h;
    }
    const projects = [...byProject.entries()]
      .map(([name, v]) => ({ name, hours: Math.round(v.hours * 10) / 10, billable: Math.round(v.billable * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);

    // ── leave balances ─────────────────────────────────────────
    const typeMap = new Map(leaveTypes.map((t) => [t.id, t]));
    const leave = balances.map((b) => {
      const t = typeMap.get(b.leaveTypeId);
      return {
        name: t?.name ?? "Leave",
        color: t?.color ?? "#2563EB",
        entitled: b.entitled,
        used: b.used,
        pending: b.pending,
        available: Math.max(0, b.entitled - b.used - b.pending),
      };
    });
    const leaveAvailable = leave.reduce((a, b) => a + b.available, 0);

    // ── payroll trend ──────────────────────────────────────────
    const payTrend = payslips.map((p) => ({
      label: new Date(Date.UTC(p.period.year, p.period.month - 1, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
      net: p.net,
    }));
    const avgNet = payTrend.length ? Math.round(payTrend.reduce((a, p) => a + p.net, 0) / payTrend.length) : 0;

    // ── auto highlights ────────────────────────────────────────
    const onTimeRate = punched.length ? Math.round((onTime / punched.length) * 100) : 0;
    const avgHours = workedDays ? Math.round((totalMinutes / workedDays / 60) * 10) / 10 : 0;
    const completionRate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
    const billableRate = totalHours ? Math.round((billableHours / totalHours) * 100) : 0;

    const highlights: { tone: "success" | "warning" | "danger" | "info"; text: string }[] = [];
    if (onTimeRate >= 90) highlights.push({ tone: "success", text: `Excellent punctuality — ${onTimeRate}% on-time arrivals this month.` });
    else if (onTimeRate >= 75) highlights.push({ tone: "info", text: `Solid punctuality at ${onTimeRate}% — median arrival ${medianArrival !== null ? fmtHHMM(medianArrival) : "—"}.` });
    else highlights.push({ tone: "warning", text: `Punctuality needs attention — only ${onTimeRate}% on-time, averaging ${avgLate}m late.` });
    if (streak >= 5) highlights.push({ tone: "success", text: `${streak}-day attendance streak — keep it going!` });
    else if (streak >= 2) highlights.push({ tone: "info", text: `Current attendance streak: ${streak} working day${streak > 1 ? "s" : ""}.` });
    if (overdue > 0) highlights.push({ tone: "danger", text: `${overdue} task${overdue > 1 ? "s are" : " is"} overdue — clear them to stay on track.` });
    else if (completionRate >= 50) highlights.push({ tone: "success", text: `${completionRate}% of your tasks are completed.` });
    if (totalOT / 60 >= 6) highlights.push({ tone: "info", text: `${(totalOT / 60).toFixed(1)}h overtime logged — your effort is tracked for payroll.` });
    if (billableRate > 0) highlights.push({ tone: "info", text: `${billableRate}% of logged timesheet hours were billable.` });
    if (leaveAvailable <= 2) highlights.push({ tone: "warning", text: `Only ${leaveAvailable} leave day${leaveAvailable === 1 ? "" : "s"} remaining this year.` });

    return ok({
      period: { from: from30.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) },
      attendance: {
        trend,
        distribution: Object.entries(distribution).map(([status, count]) => ({ status, count })),
        punctuality: {
          onTimeRate,
          avgLateMinutes: avgLate,
          medianArrival: medianArrival !== null ? fmtHHMM(medianArrival) : null,
          earlyExits,
          punchedDays: punched.length,
        },
        streak,
        totals: {
          workedDays,
          avgHours,
          overtimeHours: Math.round((totalOT / 60) * 10) / 10,
        },
      },
      tasks: { weekly, summary: { total: tasks.length, completed, open, overdue, completionRate } },
      timesheet: { projects, totalHours: Math.round(totalHours * 10) / 10, billableRate },
      leave: { balances: leave, totalAvailable: leaveAvailable },
      payroll: { trend: payTrend, avgNet },
      highlights,
    });
  } catch (err) {
    return serverError(err);
  }
}
