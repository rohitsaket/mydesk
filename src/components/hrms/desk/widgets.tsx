"use client";

import { useHrmsStore } from "@/lib/hrms/store";
import { apiPost } from "@/lib/hrms/client";
import type { DeskPayload, TaskItem, UpcomingEvent } from "@/lib/hrms/types";
import { fmtDuration, fmtTime, fmtDateShort, relativeTime, fmtDate, TASK_STATUS_LABELS, PRIORITY_LABELS, ATTENDANCE_STATUS_LABELS } from "@/lib/hrms/time";
import { SectionCard, StatCard, StatusBadge, PriorityBadge, EmptyState, Initials } from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  AlarmClock, CalendarDays, CheckCircle2, ChevronRight, Circle, Clock,
  Coffee, Gauge, Gift, Laptop, Megaphone, Plane, PlaneTakeoff, Receipt,
  Timer, TrendingUp, UserCheck, AlertTriangle, BriefcaseBusiness, FileClock,
  LifeBuoy, BadgeCheck, PartyPopper, CalendarClock, ClipboardCheck, BarChart3,
} from "lucide-react";
import type { ViewKey } from "@/lib/hrms/types";

// ── Quick action panel ───────────────────────────────────────
export function QuickActions() {
  const navigate = useHrmsStore((s) => s.navigate);
  const actions: { label: string; view: ViewKey; form?: string; icon: typeof Plane }[] = [
    { label: "Apply Leave", view: "leave", form: "apply", icon: Plane },
    { label: "Regularize", view: "attendance", form: "regularize", icon: CalendarClock },
    { label: "Request WFH", view: "wfh", form: "apply", icon: BriefcaseBusiness },
    { label: "On Duty", view: "onduty", form: "apply", icon: PlaneTakeoff },
    { label: "Timesheet", view: "timesheet", form: "add", icon: FileClock },
    { label: "Expense", view: "expenses", form: "add", icon: Receipt },
    { label: "HR Ticket", view: "helpdesk", form: "raise", icon: LifeBuoy },
    { label: "Insights", view: "insights", icon: BarChart3 },
  ];
  return (
    <SectionCard title="Quick Actions">
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => navigate(a.view, a.form)}
            className="focus-ring group flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-105">
              <a.icon className="h-3.5 w-3.5" />
            </span>
            <span className="truncate text-xs font-medium text-foreground">{a.label}</span>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Summary cards ────────────────────────────────────────────
export function SummaryCards({ data }: { data: DeskPayload }) {
  const s = data.summary;
  const att = data.attendance;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Shift" value={fmtDuration(s.requiredMinutes)} hint={s.shift} icon={<AlarmClock className="h-3.5 w-3.5" />} />
      <StatCard label="Worked" value={fmtDuration(att.state === "NOT_STARTED" ? 0 : att.workedMinutes)} hint="Net hours today" icon={<Clock className="h-3.5 w-3.5" />} tone="info" />
      <StatCard label="Break" value={fmtDuration(att.breakMinutes)} hint={att.shift ? `Allowance ${att.shift.breakAllowanceMinutes}m` : ""} icon={<Coffee className="h-3.5 w-3.5" />} />
      <StatCard label="Remaining" value={fmtDuration(att.remainingMinutes)} hint={att.state === "CHECKED_OUT" ? "Day completed" : "To complete 8h 30m"} icon={<Timer className="h-3.5 w-3.5" />} tone={att.remainingMinutes > 0 ? "warning" : "success"} />
      <StatCard label="Overtime" value={fmtDuration(att.overtimeMinutes)} hint="Beyond required hours" icon={<TrendingUp className="h-3.5 w-3.5" />} tone="success" />
    </div>
  );
}

// ── Workday timeline ───────────────────────────────────────
export function TodayTimeline({ data }: { data: DeskPayload }) {
  const { timeFormat } = useHrmsStore();
  const events = data.attendance.timeline;
  return (
    <SectionCard title="Today's Timeline" contentClassName="space-y-0">
      {events.length === 0 ? (
        <EmptyState title="No activity yet" message="Your check-ins, breaks and checkouts will appear here." icon={<Circle className="h-5 w-5" />} />
      ) : (
        <ol className="relative ml-1.5 space-y-0">
          {events.map((ev, i) => {
            const isLast = i === events.length - 1;
            const isPending = ev.pending;
            const isBreak = ev.type === "BREAK_START";
            const isResume = ev.type === "BREAK_END";
            const dot = isPending
              ? "border-dashed border-muted-foreground/50 bg-background"
              : isBreak ? "border-warning bg-warning-soft"
              : isResume ? "border-info bg-info-soft"
              : ev.type === "CHECK_IN" ? "border-success bg-success-soft"
              : "border-foreground bg-card";
            return (
              <li key={ev.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                {!isLast ? <span className="absolute left-[7px] top-4 h-full w-px bg-border" aria-hidden /> : null}
                <span className={cn("relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2", dot)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className={cn("text-sm", isPending ? "text-muted-foreground" : "font-medium text-foreground")}>{ev.label}</p>
                    <p className={cn("text-xs tabular", isPending ? "text-muted-foreground/70" : "text-muted-foreground")}>{fmtTime(ev.timestamp, timeFormat)}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                    {ev.source && !isPending ? `via ${ev.source.toLowerCase()} · ` : ""}
                    {data.attendance.deviceInfo && ev.type === "CHECK_IN" ? data.attendance.deviceInfo : isPending ? "upcoming" : "recorded"}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}

// ── Upcoming events + next holiday ───────────────────────────
export function UpcomingPanel({ data }: { data: DeskPayload }) {
  const { timeFormat } = useHrmsStore();
  const navigate = useHrmsStore((s) => s.navigate);
  return (
    <div className="grid gap-3 sm:gap-4">
      <SectionCard title="Upcoming" action={
        <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => navigate("calendar")}>
          Full calendar <ChevronRight className="h-3 w-3" />
        </button>
      }>
        {data.events.length === 0 ? (
          <EmptyState title="Nothing scheduled" message="Meetings, training and events will appear here." />
        ) : (
          <ul className="space-y-1">
            {data.events.slice(0, 5).map((e: UpcomingEvent) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                <div className="w-[72px] shrink-0 text-center">
                  {e.isToday ? (
                    <p className="text-[10px] font-semibold uppercase text-primary">Today</p>
                  ) : (
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">{fmtDateShort(e.startAt)}</p>
                  )}
                  <p className="text-xs font-medium tabular text-foreground">{e.allDay ? "All day" : fmtTime(e.startAt, timeFormat)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
                  {e.location ? <p className="truncate text-[11px] text-muted-foreground">{e.location}</p> : null}
                </div>
                <EventBadge type={e.type} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 min-[420px]:grid-cols-2">
        {data.nextHoliday ? <CardHoliday holiday={data.nextHoliday} /> : null}
        {data.birthdays.length > 0 ? (
          <SectionCard title="Celebrations" icon={<PartyPopper className="h-3.5 w-3.5 text-primary" />}>
            <ul className="space-y-2">
              {data.birthdays.slice(0, 3).map((b) => (
                <li key={`${b.type}-${b.id}`} className="flex items-center gap-2.5">
                  <Initials first={b.name.split(" ")[0]} last={b.name.split(" ")[1] ?? ""} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{b.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {b.type === "BIRTHDAY" ? "Birthday" : "Work anniversary"} {b.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
      </div>

      {data.assets.length > 0 ? (
        <SectionCard title="My Assets" icon={<Laptop className="h-3.5 w-3.5 text-primary" />}>
          <ul className="space-y-2">
            {data.assets.map((a) => (
              <li key={a.code} className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">{a.name}</span>
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">{a.code}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}

function CardHoliday({ holiday }: { holiday: NonNullable<DeskPayload["nextHoliday"]> }) {
  return (
    <SectionCard title="Next Holiday" icon={<Gift className="h-3.5 w-3.5 text-primary" />}>
      <p className="text-sm font-semibold text-foreground">{holiday.name}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(holiday.date)}</p>
      <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-accent px-3 py-2.5">
        <CalendarDays className="h-4 w-4 text-primary" />
        <p className="text-xs font-medium text-accent-foreground">
          {holiday.daysRemaining === 0 ? "Today!" : `${holiday.daysRemaining} day${holiday.daysRemaining === 1 ? "" : "s"} remaining`}
        </p>
      </div>
    </SectionCard>
  );
}

function EventBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    MEETING: { label: "Meeting", cls: "bg-info-soft text-info border-info/20" },
    TRAINING: { label: "Training", cls: "bg-accent text-accent-foreground border-accent" },
    EVENT: { label: "Event", cls: "bg-warning-soft text-[#B54708] border-warning/25" },
    PAYROLL: { label: "Payroll", cls: "bg-success-soft text-success border-success/20" },
    REVIEW: { label: "Review", cls: "bg-muted text-muted-foreground border-border" },
    INTERVIEW: { label: "Interview", cls: "bg-muted text-muted-foreground border-border" },
  };
  const m = map[type] ?? map.EVENT;
  return <Badge variant="outline" className={cn("shrink-0 text-[10px]", m.cls)}>{m.label}</Badge>;
}

// ── Weekly hours chart ───────────────────────────────────────
export function WeeklyHours({ data }: { data: DeskPayload }) {
  const days = data.weekly.days;
  const totals = data.weekly.totals;
  return (
    <SectionCard title="Weekly Working Hours" action={
      <div className="hidden gap-4 text-[11px] text-muted-foreground sm:flex">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-chart-2" />Completed</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-chart-3" />Overtime</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-chart-5" />Shortfall</span>
      </div>
    }>
      <div className="space-y-3.5">
        {days.map((d) => {
          const maxMinutes = Math.max(600, ...days.map((x) => Math.max(x.workedMinutes, x.requiredMinutes)));
          const workedPct = Math.min(100, (d.workedMinutes / maxMinutes) * 100);
          const reqPct = Math.min(100, (d.requiredMinutes / maxMinutes) * 100);
          const isOff = d.status === "WO" || d.status === "H";
          return (
            <div key={d.date} className="grid grid-cols-[64px_1fr_auto] items-center gap-3">
              <p className={cn("text-xs font-medium", d.isToday ? "text-primary" : "text-foreground")}>
                {d.dayName.slice(0, 3)}
                {d.isToday ? <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" /> : null}
              </p>
              <div className="relative h-6 overflow-hidden rounded-md bg-muted">
                {/* required marker */}
                <div className="absolute inset-y-0 bg-primary/10" style={{ width: `${reqPct}%` }} aria-hidden />
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-md transition-all",
                    d.workedMinutes > d.requiredMinutes ? "bg-gradient-to-r from-chart-2 to-chart-3" : d.workedMinutes === 0 ? "bg-transparent" : "bg-chart-2"
                  )}
                  style={{ width: `${workedPct}%` }}
                />
                {d.isFuture ? (
                  <div className="absolute inset-0 flex items-center justify-end pr-2">
                    <span className="text-[10px] text-muted-foreground">upcoming</span>
                  </div>
                ) : null}
              </div>
              <p className={cn("w-14 text-right text-xs font-medium tabular", d.isToday ? "text-primary" : d.workedMinutes === 0 ? "text-muted-foreground" : "text-foreground")}>
                {d.isFuture || isOff ? (isOff ? "Off" : "—") : fmtDuration(d.workedMinutes)}
              </p>
            </div>
          );
        })}
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-center sm:grid-cols-4">
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Required</p><p className="text-xs font-semibold tabular">{fmtDuration(totals.requiredMinutes)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Completed</p><p className="text-xs font-semibold tabular text-chart-2">{fmtDuration(totals.workedMinutes)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Overtime</p><p className="text-xs font-semibold tabular text-chart-3">{fmtDuration(totals.overtimeMinutes)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Shortfall</p><p className="text-xs font-semibold tabular text-chart-5">{fmtDuration(totals.shortfallMinutes)}</p></div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── My tasks widget ──────────────────────────────────────────
export function MyTasksWidget({ data }: { data: DeskPayload }) {
  const navigate = useHrmsStore((s) => s.navigate);
  const { timeFormat } = useHrmsStore();
  const tasks = data.tasks;
  return (
    <SectionCard
      title="My Tasks"
      action={
        <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => navigate("tasks")}>
          All tasks <ChevronRight className="h-3 w-3" />
        </button>
      }
    >
      {tasks.length === 0 ? (
        <EmptyState title="No tasks today" message="You're all caught up. Enjoy the calm!" icon={<CheckCircle2 className="h-5 w-5 text-success" />} />
      ) : (
        <ul className="space-y-1">
          {tasks.slice(0, 6).map((t: TaskItem) => (
            <li key={t.id} className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
              <span className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                t.status === "COMPLETED" ? "border-success bg-success text-white" :
                t.status === "IN_PROGRESS" ? "border-primary" :
                t.status === "BLOCKED" ? "border-destructive" :
                t.status === "REVIEW" ? "border-warning" : "border-muted-foreground/40"
              )}>
                {t.status === "COMPLETED" ? <CheckCircle2 className="h-3 w-3" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm", t.status === "COMPLETED" ? "text-muted-foreground line-through" : "font-medium text-foreground")}>{t.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  {t.dueAt ? <span className="tabular">Due {fmtTime(t.dueAt, timeFormat)}</span> : <span>No due date</span>}
                  {t.project ? <span>· {t.project}</span> : null}
                </p>
              </div>
              <PriorityBadge priority={t.priority} label={PRIORITY_LABELS[t.priority]} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ── Month summary ────────────────────────────────────────────
export function MonthSummaryWidget({ data }: { data: DeskPayload }) {
  const m = data.month;
  const navigate = useHrmsStore((s) => s.navigate);
  const rows: { label: string; value: number | string; tone?: string }[] = [
    { label: "Present", value: m.present },
    { label: "Leave", value: m.leave },
    { label: "WFH", value: m.wfh },
    { label: "On Duty", value: m.onDuty },
    { label: "Half Day", value: m.halfDay },
    { label: "Late", value: m.late },
    { label: "Holiday", value: m.holiday },
    { label: "Missing Punch", value: m.missingPunch },
  ];
  return (
    <SectionCard
      title="Attendance Summary"
      action={<span className="text-[11px] text-muted-foreground">This month</span>}
    >
      <div className="grid grid-cols-4 gap-2">
        {rows.map((r) => (
          <button
            key={r.label}
            onClick={() => navigate("attendance")}
            className="focus-ring rounded-lg border border-border bg-card p-2.5 text-center transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <p className={cn("text-lg font-semibold tabular", r.label === "Missing Punch" && Number(r.value) > 0 ? "text-danger" : "text-foreground")}>{r.value}</p>
            <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{r.label}</p>
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-primary" />
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Average hours</p>
            <p className="text-sm font-semibold tabular">{fmtDuration(m.averageMinutes)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-3.5 w-3.5 text-success" />
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Payable days</p>
            <p className="text-sm font-semibold tabular">{m.payableDays}</p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Leave balance widget ─────────────────────────────────────
export function LeaveBalanceWidget({ data }: { data: DeskPayload }) {
  const navigate = useHrmsStore((s) => s.navigate);
  return (
    <SectionCard
      title="Leave Balance"
      action={
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => navigate("leave", "apply")}>
          <Plane className="h-3 w-3" /> Apply Leave
        </Button>
      }
    >
      <div className="space-y-2.5">
        {data.leaveBalances.map((b) => (
          <div key={b.leaveTypeId}>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">{b.name}</p>
              <p className="text-xs tabular">
                <span className="font-semibold text-foreground">{b.available}</span>
                <span className="text-muted-foreground"> / {b.entitled}</span>
                {b.pending > 0 ? <span className="ml-1.5 text-[10px] text-warning">{b.pending} pending</span> : null}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${(b.available / Math.max(1, b.entitled)) * 100}%`, backgroundColor: b.color }}
              />
            </div>
          </div>
        ))}
      </div>
      {data.upcomingLeave ? (
        <button
          className="mt-3 flex w-full items-center justify-between rounded-lg bg-accent px-3 py-2.5 text-left transition-colors hover:bg-accent/80"
          onClick={() => navigate("leave")}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-accent-foreground/70">Upcoming leave</p>
            <p className="truncate text-xs font-medium text-accent-foreground">
              {data.upcomingLeave.leaveType} · {data.upcomingLeave.days}d · from {fmtDateShort(data.upcomingLeave.fromDate)}
            </p>
          </div>
          <StatusBadge status={data.upcomingLeave.status} label={data.upcomingLeave.status === "APPROVED" ? "Approved" : "Pending"} />
        </button>
      ) : null}
    </SectionCard>
  );
}

// ── Announcements widget ─────────────────────────────────────
export function AnnouncementsWidget({ data }: { data: DeskPayload }) {
  const queryClient = useQueryClient();
  const navigate = useHrmsStore((s) => s.navigate);

  async function ack(id: string) {
    try {
      await apiPost("/api/announcements", { action: "ack", id });
      await queryClient.invalidateQueries({ queryKey: ["desk"] });
      toast.success("Acknowledged", { description: "Thank you — your acknowledgement has been recorded." });
    } catch {
      toast.error("Could not record acknowledgement. Please retry.");
    }
  }

  return (
    <SectionCard
      title="Company Announcements"
      icon={<Megaphone className="h-3.5 w-3.5 text-primary" />}
      action={
        <span className="text-[11px] text-muted-foreground">{data.announcements.length} recent</span>
      }
    >
      {data.announcements.length === 0 ? (
        <EmptyState title="No announcements" message="Company news will appear here." />
      ) : (
        <ul className="space-y-2.5">
          {data.announcements.map((a) => (
            <li key={a.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{a.body}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={a.priority === "CRITICAL" ? "BLOCKED" : a.priority === "IMPORTANT" ? "REVIEW" : "PENDING"} label={a.priority} />
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{relativeTime(a.publishedAt)} · {a.category.toLowerCase()}</span>
                {a.requiresAck ? (
                  a.acked ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-success"><CheckCircle2 className="h-3 w-3" /> Acknowledged</span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => ack(a.id)}>
                      <BadgeCheck className="h-3 w-3" /> Acknowledge
                    </Button>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <button className="mt-1 w-full pt-1 text-center text-xs font-medium text-primary hover:underline" onClick={() => navigate("announcements")}>
        View all announcements
      </button>
    </SectionCard>
  );
}

// ── Manager widgets ──────────────────────────────────────────
export function ManagerWidgetsPanel({ data }: { data: DeskPayload }) {
  const navigate = useHrmsStore((s) => s.navigate);
  if (!data.managerWidgets) return null;
  const mw = data.managerWidgets;
  const teamStats = [
    { label: "Working", value: mw.teamToday.working, cls: "text-success" },
    { label: "On Break", value: mw.teamToday.onBreak, cls: "text-[#B54708]" },
    { label: "Leave", value: mw.teamToday.leave, cls: "text-info" },
    { label: "WFH", value: mw.teamToday.wfh, cls: "text-accent-foreground" },
    { label: "Not In", value: mw.teamToday.notCheckedIn, cls: "text-muted-foreground" },
  ];
  const approvals = [
    { label: "Leave", value: mw.pendingApprovals.leave, view: "approvals" as ViewKey },
    { label: "Attendance", value: mw.pendingApprovals.attendance, view: "approvals" as ViewKey },
    { label: "WFH / OD", value: mw.pendingApprovals.wfh + mw.pendingApprovals.onDuty, view: "approvals" as ViewKey },
    { label: "Timesheets", value: mw.pendingApprovals.timesheet, view: "approvals" as ViewKey },
    { label: "Expenses", value: mw.pendingApprovals.expense, view: "approvals" as ViewKey },
  ];
  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
      <SectionCard
        title="Team Today"
        icon={<UserCheck className="h-3.5 w-3.5 text-primary" />}
        action={
          <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => navigate("team")}>
            {mw.teamToday.total} members <ChevronRight className="h-3 w-3" />
          </button>
        }
      >
        <div className="grid grid-cols-5 gap-2">
          {teamStats.map((t) => (
            <div key={t.label} className="rounded-lg border border-border p-2 text-center">
              <p className={cn("text-lg font-semibold tabular", t.cls)}>{t.value}</p>
              <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{t.label}</p>
            </div>
          ))}
        </div>
        <Progress value={(mw.teamToday.working / Math.max(1, mw.teamToday.total)) * 100} className="mt-3 h-1.5" />
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {Math.round((mw.teamToday.working / Math.max(1, mw.teamToday.total)) * 100)}% of team currently working
        </p>
      </SectionCard>

      <SectionCard
        title="Pending Approvals"
        icon={<ClipboardIcon />}
        action={
          <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => navigate("approvals")}>
            Open inbox <ChevronRight className="h-3 w-3" />
          </button>
        }
      >
        <div className="grid grid-cols-5 gap-2">
          {approvals.map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.view)}
              className="focus-ring rounded-lg border border-border p-2 text-center transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <p className={cn("text-lg font-semibold tabular", a.value > 0 ? "text-primary" : "text-muted-foreground")}>{a.value}</p>
              <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{a.label}</p>
            </button>
          ))}
        </div>
        {mw.pendingApprovals.total > 0 ? (
          <p className="mt-3 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground">
            {mw.pendingApprovals.total} request{mw.pendingApprovals.total === 1 ? "" : "s"} awaiting your action
          </p>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> No pending approvals. Inbox zero!</p>
        )}
      </SectionCard>
    </div>
  );
}

function ClipboardIcon() {
  return <ClipboardCheck className="h-3.5 w-3.5 text-primary" />;
}

// ── Warning banners ──────────────────────────────────────────
export function WarningBanners({ data }: { data: DeskPayload }) {
  const navigate = useHrmsStore((s) => s.navigate);
  if (data.warnings.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {data.warnings.map((w) => (
        <div key={w.id} className="flex flex-col gap-2.5 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-[#B54708]">{w.title}</p>
              <p className="text-xs text-[#B54708]/80">{w.message}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5 border-warning/40 text-[#B54708] hover:bg-warning-soft/70" onClick={() => navigate(w.link as ViewKey)}>
            Fix Now <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
