"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, ReferenceLine,
} from "recharts";
import {
  BarChart3, Clock, Timer, Flame, TrendingUp, RefreshCw, CheckCircle2,
  Info, AlertTriangle, Zap, Sparkles, IndianRupee,
} from "lucide-react";
import { apiGet } from "@/lib/hrms/client";
import type { InsightsPayload } from "@/lib/hrms/types";
import { PageHeader, SectionCard, StatCard, EmptyState, DataState } from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── chart palette (token-driven, adapts to dark mode) ───────
const STATUS_COLORS: Record<string, string> = {
  P: "var(--success)",
  A: "var(--danger)",
  L: "#0EA5E9",
  WO: "#94A3B8",
  H: "#2E90FA",
  WFH: "#7A5AF8",
  OD: "var(--warning)",
  HD: "#F04438",
  MP: "#F04438",
};
const STATUS_LABELS: Record<string, string> = {
  P: "Present", A: "Absent", L: "On Leave", WO: "Weekly Off", H: "Holiday",
  WFH: "WFH", OD: "On Duty", HD: "Half Day", MP: "Missing Punch",
};
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

// staggered entrance classes (tw-animate-css — no JS animation dep)
const RISE = "animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both";
const rise = (delayMs: number) => ({ animationDelay: `${delayMs}ms` });

// ── shared chart tooltip ────────────────────────────────────
function ChartTip({ active, payload, label, suffix = "" }: {
  active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string }>; label?: string; suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      {label !== undefined ? <p className="mb-1 font-medium text-foreground">{label}</p> : null}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 py-0.5 text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.color ?? "var(--primary)" }} />
          {p.name}
          <span className="ml-auto pl-3 font-medium tabular text-foreground">
            {typeof p.value === "number" ? p.value.toLocaleString("en-IN") : p.value}{suffix}
          </span>
        </p>
      ))}
    </div>
  );
}

const axisProps = {
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  axisLine: false as const,
  tickLine: false as const,
};

// ── main view ───────────────────────────────────────────────
export default function InsightsView() {
  const query = useQuery({
    queryKey: ["insights"],
    queryFn: () => apiGet<InsightsPayload>("/api/insights"),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Insights"
        subtitle="Your productivity analytics — attendance, tasks, time & pay"
        actions={
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", query.isFetching && "animate-spin")} /> Refresh
          </Button>
        }
      />
      <div className="h-1 w-28 rounded-full bg-gradient-to-r from-primary via-[var(--success)] to-[var(--warning)]" />

      <DataState query={query} errorTitle="Could not load insights">
        {(d) => (d.attendance.trend.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title="No analytics yet"
            message="Insights appear once you have a few days of attendance, tasks and timesheets recorded."
          />
        ) : (
          <div className="space-y-4">
            {/* ── stat row ── */}
            <div className={cn("grid grid-cols-2 gap-3 xl:grid-cols-4", RISE)}>
              <StatCard
                label="On-Time Arrivals" value={`${d.attendance.punctuality.onTimeRate}%`}
                hint={d.attendance.punctuality.medianArrival ? `median arrival ${d.attendance.punctuality.medianArrival}` : "no punches yet"}
                icon={<Clock className="h-4 w-4" />}
                tone={d.attendance.punctuality.onTimeRate >= 90 ? "success" : d.attendance.punctuality.onTimeRate >= 75 ? "info" : "warning"}
              />
              <StatCard
                label="Avg Workday" value={`${d.attendance.totals.avgHours}h`}
                hint={`${d.attendance.totals.workedDays} working days · ${d.attendance.totals.overtimeHours}h OT`}
                icon={<Timer className="h-4 w-4" />}
              />
              <StatCard
                label="Attendance Streak" value={`${d.attendance.streak} ${d.attendance.streak === 1 ? "day" : "days"}`}
                hint="consecutive working days" icon={<Flame className="h-4 w-4" />} tone="warning"
              />
              <StatCard
                label="Tasks Completed" value={`${d.tasks.summary.completed}/${d.tasks.summary.total}`}
                hint={d.tasks.summary.overdue > 0 ? `${d.tasks.summary.overdue} overdue` : `${d.tasks.summary.open} open`}
                icon={<CheckCircle2 className="h-4 w-4" />}
                tone={d.tasks.summary.overdue > 0 ? "danger" : "success"}
              />
            </div>

            {/* ── row 1: hours trend + attendance mix ── */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className={cn(RISE, "lg:col-span-2")} style={rise(80)}>
                <SectionCard title="Worked Hours — Last 30 Days" icon={<Timer className="h-4 w-4 text-primary" />}>
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={d.attendance.trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="hoursFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" {...axisProps} interval={4} />
                        <YAxis {...axisProps} unit="h" width={44} />
                        <Tooltip content={<ChartTip suffix="h" />} cursor={{ stroke: "var(--border)" }} />
                        <ReferenceLine y={8.5} stroke="var(--muted-foreground)" strokeDasharray="4 4"
                          label={{ value: "shift 8.5h", fill: "var(--muted-foreground)", fontSize: 10, position: "insideTopRight" }} />
                        <Area type="monotone" dataKey="hours" name="Worked" stroke="var(--primary)" strokeWidth={2}
                          fill="url(#hoursFill)" connectNulls dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>
              </div>

              <div className={cn(RISE, "lg:col-span-1")} style={rise(160)}>
                <SectionCard title="Attendance Mix" icon={<Sparkles className="h-4 w-4 text-primary" />}>
                  <div className="relative h-[170px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={d.attendance.distribution} dataKey="count" nameKey="status"
                          innerRadius="62%" outerRadius="92%" paddingAngle={2} strokeWidth={0}
                        >
                          {d.attendance.distribution.map((s) => (
                            <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#94A3B8"} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-2xl font-semibold tabular text-foreground">{d.attendance.totals.workedDays}</p>
                      <p className="text-[11px] text-muted-foreground">working days</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                    {d.attendance.distribution
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .map((s) => (
                        <p key={s.status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[s.status] ?? "#94A3B8" }} />
                          {STATUS_LABELS[s.status] ?? s.status}
                          <span className="font-medium tabular text-foreground">{s.count}</span>
                        </p>
                      ))}
                  </div>
                </SectionCard>
              </div>
            </div>

            {/* ── row 2: tasks + leave + projects ── */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className={RISE} style={rise(220)}>
                <SectionCard title="Task Throughput" icon={<TrendingUp className="h-4 w-4 text-primary" />}>
                  <div className="h-[190px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.tasks.weekly} margin={{ top: 4, right: 8, left: -22, bottom: 0 }} barGap={3}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="week" {...axisProps} />
                        <YAxis {...axisProps} allowDecimals={false} width={36} />
                        <Tooltip content={<ChartTip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                        <Bar dataKey="created" name="Created" fill="var(--muted-foreground)" fillOpacity={0.45} radius={[3, 3, 0, 0]} maxBarSize={22} />
                        <Bar dataKey="completed" name="Completed" fill="var(--success)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {d.tasks.summary.completionRate}% lifetime completion · {d.tasks.summary.open} open
                  </p>
                </SectionCard>
              </div>

              <div className={RISE} style={rise(280)}>
                <SectionCard title="Leave Balance" icon={<Sparkles className="h-4 w-4 text-primary" />}>
                  <div className="relative h-[170px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={d.leave.balances} dataKey="available" nameKey="name"
                          innerRadius="62%" outerRadius="92%" paddingAngle={2} strokeWidth={0}
                        >
                          {d.leave.balances.map((l, i) => (
                            <Cell key={i} fill={l.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTip suffix=" d" />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-2xl font-semibold tabular text-foreground">{d.leave.totalAvailable}</p>
                      <p className="text-[11px] text-muted-foreground">days available</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {d.leave.balances.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color }} />
                        <span className="truncate text-muted-foreground">{l.name}</span>
                        <span className="ml-auto shrink-0 font-medium tabular text-foreground">
                          {l.available}<span className="text-muted-foreground">/{l.entitled} d</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>

              <div className={RISE} style={rise(340)}>
                <SectionCard title="Time by Project" icon={<Zap className="h-4 w-4 text-primary" />}
                  action={<span className="text-xs tabular text-muted-foreground">{d.timesheet.totalHours}h · {d.timesheet.billableRate}% billable</span>}>
                  {d.timesheet.projects.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">No timesheet hours logged in the last 6 weeks.</p>
                  ) : (
                    <div className="space-y-3">
                      {d.timesheet.projects.slice(0, 6).map((p) => {
                        const max = d.timesheet.projects[0]?.hours || 1;
                        const pct = Math.max(6, Math.round((p.hours / max) * 100));
                        const billPct = p.hours > 0 ? Math.round((p.billable / p.hours) * 100) : 0;
                        return (
                          <div key={p.name}>
                            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                              <span className="truncate font-medium text-foreground">{p.name}</span>
                              <span className="shrink-0 tabular text-muted-foreground">{p.hours}h</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className="flex h-full overflow-hidden rounded-full transition-[width] duration-700 ease-out"
                                style={{ width: `${pct}%` }}
                              >
                                <div className="h-full bg-primary" style={{ width: `${billPct}%` }} />
                                <div className="h-full bg-primary/30" style={{ width: `${100 - billPct}%` }} />
                              </div>
                            </div>
                            {billPct > 0 && billPct < 100 ? (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{billPct}% billable</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>

            {/* ── row 3: pay trend + highlights ── */}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className={RISE} style={rise(400)}>
                <SectionCard title="Net Pay Trend" icon={<IndianRupee className="h-4 w-4 text-primary" />}>
                  {d.payroll.trend.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">No payslips generated yet.</p>
                  ) : (
                    <>
                      <div className="h-[130px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={d.payroll.trend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                            <defs>
                              <linearGradient id="payFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--success)" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="label" {...axisProps} />
                            <YAxis hide domain={["dataMin - 2000", "dataMax + 2000"]} />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="rounded-lg border border-border bg-popover px-3 py-1.5 text-xs shadow-lg">
                                    <p className="font-medium text-foreground">{label}</p>
                                    <p className="tabular text-[var(--success)]">{inr.format(Number(payload[0].value))}</p>
                                  </div>
                                );
                              }}
                            />
                            <Area type="monotone" dataKey="net" name="Net pay" stroke="var(--success)" strokeWidth={2}
                              fill="url(#payFill)" dot={{ r: 3, fill: "var(--success)", strokeWidth: 0 }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between text-xs">
                        {d.payroll.trend.map((p, i) => (
                          <p key={i} className="tabular text-muted-foreground">
                            {p.label} <span className="font-medium text-foreground">{inr.format(p.net)}</span>
                          </p>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">Average net: <span className="font-medium tabular text-foreground">{inr.format(d.payroll.avgNet)}</span></p>
                    </>
                  )}
                </SectionCard>
              </div>

              <div className={cn(RISE, "lg:col-span-2")} style={rise(460)}>
                <SectionCard title="Highlights" icon={<Sparkles className="h-4 w-4 text-primary" />}
                  action={<span className="text-xs text-muted-foreground">auto-generated from your data</span>}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {d.highlights.map((h, i) => {
                      const tone = {
                        success: { icon: CheckCircle2, cls: "bg-[var(--success-soft)] text-[var(--success)]" },
                        info: { icon: Info, cls: "bg-[var(--info-soft)] text-[var(--info)]" },
                        warning: { icon: AlertTriangle, cls: "bg-[var(--warning-soft)] text-[#B54708]" },
                        danger: { icon: AlertTriangle, cls: "bg-[var(--danger-soft)] text-[var(--danger)]" },
                      }[h.tone];
                      const Icon = tone.icon;
                      return (
                        <div key={i} className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3">
                          <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", tone.cls)}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <p className="text-xs leading-relaxed text-foreground">{h.text}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { label: "Punched days", value: d.attendance.punctuality.punchedDays },
                      { label: "Avg late", value: `${d.attendance.punctuality.avgLateMinutes}m` },
                      { label: "Early exits", value: d.attendance.punctuality.earlyExits },
                      { label: "Billable rate", value: `${d.timesheet.billableRate}%` },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                        <p className="mt-0.5 text-sm font-semibold tabular text-foreground">{s.value}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            </div>
          </div>
        ))}
      </DataState>
    </div>
  );
}
