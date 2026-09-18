"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet, apiPost, ApiError } from "@/lib/hrms/client";
import {
  fmtTime, fmtDate, fmtDateShort, fmtDuration, dayIST, ORG_TZ, ATTENDANCE_STATUS_LABELS,
} from "@/lib/hrms/time";
import {
  PageHeader, SectionCard, StatusBadge, StatCard, EmptyState, DataState, InfoRow,
} from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CalendarClock, CalendarDays, CheckCircle2, Clock, Home,
  TrendingUp, Timer, AlertTriangle, Loader2,
} from "lucide-react";

// ── types ───────────────────────────────────────────────────
interface MonthDay {
  date: string; dayName: string; status: string; statusLabel: string; state: string;
  firstCheckIn: string | null; lastCheckOut: string | null;
  workedMinutes: number; breakMinutes: number; overtimeMinutes: number; lateMinutes: number;
  shiftName: string | null; regularized: boolean; hasRecord: boolean;
}
interface MonthSummary {
  present: number; absent: number; leave: number; halfDay: number; late: number;
  wfh: number; onDuty: number; weeklyOff: number; holiday: number; missingPunch: number;
  averageMinutes: number; payableDays: number; overtimeMinutes: number;
}
interface MonthData { year: number; month: number; days: MonthDay[]; summary: MonthSummary }
interface RegItem {
  id: string; code: string; date: string;
  currentCheckIn: string | null; currentCheckOut: string | null;
  requestedCheckIn: string | null; requestedCheckOut: string | null;
  reason: string; status: string; appliedAt: string; decidedAt: string | null; decisionNote: string | null;
}

// ── status visual maps ─────────────────────────────────────
const CAL_STYLES: Record<string, { dot: string; chip: string }> = {
  P: { dot: "bg-success", chip: "bg-success-soft text-success" },
  A: { dot: "bg-danger", chip: "bg-danger-soft text-danger" },
  L: { dot: "bg-info", chip: "bg-info-soft text-info" },
  H: { dot: "bg-muted-foreground/50", chip: "bg-muted text-muted-foreground" },
  WO: { dot: "bg-muted-foreground/40", chip: "bg-muted text-muted-foreground" },
  WFH: { dot: "bg-primary", chip: "bg-primary/10 text-primary" },
  OD: { dot: "bg-warning", chip: "bg-warning-soft text-[#B54708]" },
  HD: { dot: "bg-warning", chip: "bg-warning-soft text-[#B54708]" },
  MP: { dot: "bg-danger", chip: "bg-danger-soft text-danger" },
  PENDING: { dot: "bg-border", chip: "bg-background text-muted-foreground/70 border border-dashed border-border" },
};

const STATUS_CODE: Record<string, string> = {
  P: "P", A: "A", L: "L", H: "H", WO: "WO", WFH: "WFH", OD: "OD", HD: "½", MP: "MP", PENDING: "–",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toHHMMIST(t: string | null | undefined): string {
  if (!t) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: ORG_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(t));
  } catch {
    return "";
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── main view ───────────────────────────────────────────────
export default function AttendanceView() {
  const timeFormat = useHrmsStore((s) => s.timeFormat);
  const openForm = useHrmsStore((s) => s.openForm);
  const setOpenForm = useHrmsStore((s) => s.setOpenForm);
  const queryClient = useQueryClient();

  const today = useMemo(() => dayIST(new Date()), []);
  const [ym, setYm] = useState(() => ({ year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 }));
  const [selectedDay, setSelectedDay] = useState<MonthDay | null>(null);
  const [regOpen, setRegOpen] = useState(false);

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
      const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
      opts.push({ value: `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`, label });
    }
    return opts;
  }, [today]);

  const monthQuery = useQuery({
    queryKey: ["attendance", "month", ym.year, ym.month],
    queryFn: () => apiGet<MonthData>(`/api/attendance/month?year=${ym.year}&month=${ym.month}`),
  });
  const regQuery = useQuery({
    queryKey: ["regularizations"],
    queryFn: () => apiGet<{ requests: RegItem[] }>("/api/attendance/regularization"),
  });

  // auto-open regularization dialog when navigated with a form trigger (e.g. quick create)
  useEffect(() => {
    if (openForm !== "regularize") return;
    // deferred so the dialog mount happens outside the effect body
    const t = setTimeout(() => {
      setRegOpen(true);
      setOpenForm(null);
    }, 0);
    return () => clearTimeout(t);
  }, [openForm, setOpenForm]);

  const monthValue = `${ym.year}-${ym.month}`;
  const monthLabel = monthOptions.find((o) => o.value === monthValue)?.label ?? "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance"
        subtitle="Daily punches, month summary and regularizations"
        icon={<CalendarDays className="h-4.5 w-4.5" />}
        actions={
          <Select
            value={monthValue}
            onValueChange={(v) => {
              const [y, m] = v.split("-").map(Number);
              setYm({ year: y, month: m });
            }}
          >
            <SelectTrigger className="h-9 w-[170px] text-sm" aria-label="Select month">
              <CalendarDays className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <DataState query={monthQuery}>
        {(data) => (
          <>
            <StatCards summary={data.summary} />
            <CalendarGrid data={data} today={today} onSelectDay={setSelectedDay} />
            <HistoryTable data={data} timeFormat={timeFormat} />
          </>
        )}
      </DataState>

      <RegularizationSection
        regQuery={regQuery}
        monthData={monthQuery.data ?? null}
        timeFormat={timeFormat}
        open={regOpen}
        onOpenChange={setRegOpen}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["regularizations"] });
          void queryClient.invalidateQueries({ queryKey: ["attendance", "month"] });
          void queryClient.invalidateQueries({ queryKey: ["desk"] });
        }}
      />

      <DayDetailDialog day={selectedDay} onClose={() => setSelectedDay(null)} timeFormat={timeFormat} />
    </div>
  );
}

// ── stat cards ──────────────────────────────────────────────
function StatCards({ summary }: { summary: MonthSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Present" value={summary.present}
        hint={`${summary.payableDays.toFixed(1)} payable days`} tone="success"
        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
      />
      <StatCard
        label="Late" value={summary.late} hint="After grace period" tone="warning"
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
      />
      <StatCard
        label="Leave" value={summary.leave} hint={`${summary.halfDay} half day(s)`} tone="info"
        icon={<CalendarClock className="h-3.5 w-3.5" />}
      />
      <StatCard
        label="WFH + On Duty" value={summary.wfh + summary.onDuty}
        hint={`${summary.wfh} WFH · ${summary.onDuty} OD`}
        icon={<Home className="h-3.5 w-3.5" />}
      />
      <StatCard
        label="Avg Hours" value={fmtDuration(summary.averageMinutes)} hint="Per worked day"
        tone="info" icon={<Clock className="h-3.5 w-3.5" />}
      />
    </div>
  );
}

// ── calendar grid ───────────────────────────────────────────
function CalendarGrid({
  data, today, onSelectDay,
}: { data: MonthData; today: Date; onSelectDay: (d: MonthDay) => void }) {
  const lead = (new Date(data.days[0].date).getUTCDay() + 6) % 7; // Monday-first offset
  const todayIso = isoDay(today);
  const cells: (MonthDay | null)[] = [...Array(lead).fill(null), ...data.days];

  return (
    <SectionCard title="Attendance Calendar" contentClassName="space-y-3">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} aria-hidden />;
          const iso = day.date.slice(0, 10);
          const isToday = iso === todayIso;
          const isFuture = day.date > today.toISOString();
          const style = CAL_STYLES[day.status] ?? CAL_STYLES.PENDING;
          const workedHint = day.workedMinutes > 0 ? fmtDuration(day.workedMinutes) : null;
          return (
            <button
              key={day.date}
              onClick={() => onSelectDay(day)}
              title={`${day.dayName} · ${day.statusLabel}${workedHint ? ` · ${workedHint}` : ""}`}
              className={cn(
                "group relative flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-lg border border-border/60 bg-card px-0.5 py-1.5 text-center transition-colors hover:border-primary/40 hover:bg-accent",
                isFuture && "opacity-60",
                isToday && "border-primary/60 ring-2 ring-primary/70"
              )}
            >
              <span className={cn("text-xs font-semibold tabular", isToday ? "text-primary" : "text-foreground")}>
                {new Date(day.date).getUTCDate()}
              </span>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[9px] font-semibold leading-none", style.chip)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden />
                {STATUS_CODE[day.status] ?? day.status}
              </span>
              {day.regularized ? (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-info" title="Regularized" aria-label="Regularized" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border pt-2.5">
        {Object.entries(ATTENDANCE_STATUS_LABELS).map(([code, label]) => {
          const style = CAL_STYLES[code] ?? CAL_STYLES.PENDING;
          return (
            <span key={code} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden />
              <span className="font-semibold text-foreground/80">{STATUS_CODE[code] ?? code}</span>
              {label}
            </span>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ── day detail dialog ───────────────────────────────────────
function DayDetailDialog({
  day, onClose, timeFormat,
}: { day: MonthDay | null; onClose: () => void; timeFormat: "12h" | "24h" }) {
  return (
    <Dialog open={!!day} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        {day ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {fmtDate(day.date)}
                <StatusBadge status={day.status} label={day.statusLabel} />
                {day.regularized ? <StatusBadge status="APPROVED" label="Regularized" /> : null}
              </DialogTitle>
              <DialogDescription>{day.dayName} · full-day attendance detail</DialogDescription>
            </DialogHeader>
            <div className="divide-y divide-border">
              <div className="pb-1">
                <InfoRow label="Shift" value={day.shiftName ?? "General Shift"} />
                <InfoRow label="Status" value={day.state === "WORKING" ? "Working" : day.state === "ON_BREAK" ? "On Break" : day.state === "CHECKED_OUT" ? "Checked Out" : "Not Started"} />
              </div>
              <div className="py-1">
                <InfoRow label="First Check-in" value={fmtTime(day.firstCheckIn, timeFormat)} mono />
                <InfoRow label="Last Check-out" value={fmtTime(day.lastCheckOut, timeFormat)} mono />
              </div>
              <div className="py-1">
                <InfoRow label="Worked" value={fmtDuration(day.workedMinutes)} mono />
                <InfoRow label="Break" value={fmtDuration(day.breakMinutes)} mono />
                <InfoRow label="Overtime" value={day.overtimeMinutes > 0 ? `+${fmtDuration(day.overtimeMinutes)}` : "—"} mono />
                <InfoRow label="Late" value={day.lateMinutes > 0 ? `${day.lateMinutes} min` : "On time"} mono />
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ── history table ───────────────────────────────────────────
function HistoryTable({ data, timeFormat }: { data: MonthData; timeFormat: "12h" | "24h" }) {
  const todayIso = dayIST(new Date()).toISOString();
  // days with a punch record, or derived past days (leave/absent/off); future days excluded
  const rows = [...data.days].reverse().filter((d) => d.hasRecord || (d.status !== "PENDING" && d.date <= todayIso));
  if (rows.length === 0) {
    return (
      <SectionCard title="Daily History">
        <EmptyState title="No records this month" message="Punch records for the selected month will appear here." />
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Daily History" contentClassName="pt-0">
      {/* desktop table */}
      <div className="hidden max-h-96 overflow-y-auto scroll-thin md:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Worked</TableHead>
              <TableHead>Break</TableHead>
              <TableHead>Overtime</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Late</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.date}>
                <TableCell className="whitespace-nowrap text-xs font-medium">
                  {fmtDateShort(d.date)}
                  <span className="ml-1 text-muted-foreground">{d.dayName.slice(0, 3)}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{d.shiftName ?? "—"}</TableCell>
                <TableCell className="text-xs tabular">{fmtTime(d.firstCheckIn, timeFormat)}</TableCell>
                <TableCell className="text-xs tabular">{fmtTime(d.lastCheckOut, timeFormat)}</TableCell>
                <TableCell className="text-xs tabular">{fmtDuration(d.workedMinutes)}</TableCell>
                <TableCell className="text-xs tabular">{fmtDuration(d.breakMinutes)}</TableCell>
                <TableCell className="text-xs tabular">{d.overtimeMinutes > 0 ? `+${fmtDuration(d.overtimeMinutes)}` : "—"}</TableCell>
                <TableCell><StatusBadge status={d.status} label={d.statusLabel} /></TableCell>
                <TableCell className="text-right text-xs tabular">
                  {d.lateMinutes > 0 ? `${d.lateMinutes}m` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* mobile cards */}
      <div className="max-h-96 space-y-1.5 overflow-y-auto scroll-thin md:hidden">
        {rows.map((d) => (
          <div key={d.date} className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">
                {fmtDateShort(d.date)} <span className="font-normal text-muted-foreground">{d.dayName.slice(0, 3)}</span>
              </p>
              <StatusBadge status={d.status} label={d.statusLabel} />
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
              <span className="tabular">In {fmtTime(d.firstCheckIn, timeFormat)}</span>
              <span className="tabular">Out {fmtTime(d.lastCheckOut, timeFormat)}</span>
              <span className="tabular">{fmtDuration(d.workedMinutes)}</span>
              <span className="tabular">Break {fmtDuration(d.breakMinutes)}</span>
              <span className="tabular">OT {d.overtimeMinutes > 0 ? fmtDuration(d.overtimeMinutes) : "—"}</span>
              <span className="tabular">Late {d.lateMinutes > 0 ? `${d.lateMinutes}m` : "—"}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── regularization section + dialog ─────────────────────────
function RegularizationSection({
  regQuery, monthData, timeFormat, open, onOpenChange, onCreated,
}: {
  regQuery: { isLoading: boolean; isError: boolean; refetch: () => void; data?: { requests: RegItem[] } };
  monthData: MonthData | null;
  timeFormat: "12h" | "24h";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const today = useMemo(() => dayIST(new Date()), []);
  const yesterday = isoDay(new Date(today.getTime() - 86400000));

  const [form, setForm] = useState({ date: yesterday, inTime: "", outTime: "", reason: "" });
  const [errors, setErrors] = useState<{ date?: string; inTime?: string; outTime?: string; reason?: string }>({});

  const currentDay = monthData?.days.find((d) => d.date.slice(0, 10) === form.date);
  // requested times: user input, else prefilled from the day's recorded punches, else shift defaults
  const inValue = form.inTime || toHHMMIST(currentDay?.firstCheckIn) || "09:30";
  const outValue = form.outTime || toHHMMIST(currentDay?.lastCheckOut) || "18:30";

  function onDateChange(date: string) {
    // reset requested times so they re-derive from the newly selected day
    setForm((f) => ({ ...f, date, inTime: "", outTime: "" }));
  }

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ code: string }>("/api/attendance/regularization", {
        date: form.date,
        requestedCheckIn: inValue,
        requestedCheckOut: outValue,
        reason: form.reason.trim(),
      }),
    onSuccess: (res) => {
      toast.success(`Regularization ${res.code} submitted`, { description: "Your manager will review the request." });
      onOpenChange(false);
      setForm({ date: yesterday, inTime: "", outTime: "", reason: "" });
      setErrors({});
      onCreated();
      void queryClient.invalidateQueries({ queryKey: ["regularizations"] });
    },
    onError: (err) => {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Could not submit the request. Please try again.");
    },
  });

  function submit() {
    const errs: typeof errors = {};
    if (!form.date) errs.date = "Select a date.";
    else if (form.date >= isoDay(today)) errs.date = "Regularization is only for past dates.";
    if (!inValue) errs.inTime = "Requested check-in is required.";
    if (!outValue) errs.outTime = "Requested check-out is required.";
    if (inValue && outValue && outValue <= inValue) errs.outTime = "Check-out must be after check-in.";
    if (form.reason.trim().length < 3) errs.reason = "Reason must be at least 3 characters.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    mutation.mutate();
  }

  return (
    <>
      <SectionCard
        title="Regularization Requests"
        icon={<CalendarClock className="h-4 w-4 text-primary" />}
        action={
          <Button size="sm" onClick={() => onOpenChange(true)}>
            <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Request Regularization
          </Button>
        }
      >
        <DataState query={regQuery} errorTitle="Unable to load regularizations">
          {({ requests }) =>
            requests.length === 0 ? (
              <EmptyState
                title="No regularization requests"
                message="Raise a request to correct a missing or wrong punch for a past day."
                icon={<Timer className="h-5 w-5" />}
                action={
                  <Button size="sm" variant="outline" onClick={() => onOpenChange(true)}>
                    Request Regularization
                  </Button>
                }
              />
            ) : (
              <>
                {/* desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Requested In</TableHead>
                        <TableHead>Requested Out</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Decision</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs font-semibold">{r.code}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{fmtDateShort(r.date)}</TableCell>
                          <TableCell className="text-xs tabular">{fmtTime(r.requestedCheckIn, timeFormat)}</TableCell>
                          <TableCell className="text-xs tabular">{fmtTime(r.requestedCheckOut, timeFormat)}</TableCell>
                          <TableCell><StatusBadge status={r.status} label={r.status === "PENDING" ? "Pending" : r.status === "APPROVED" ? "Approved" : "Rejected"} /></TableCell>
                          <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={r.decisionNote ?? undefined}>
                            {r.decisionNote ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* mobile cards */}
                <div className="space-y-1.5 md:hidden">
                  {requests.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold">{r.code} · {fmtDateShort(r.date)}</p>
                        <StatusBadge status={r.status} label={r.status === "PENDING" ? "Pending" : r.status === "APPROVED" ? "Approved" : "Rejected"} />
                      </div>
                      <p className="mt-1 text-[11px] tabular text-muted-foreground">
                        {fmtTime(r.requestedCheckIn, timeFormat)} → {fmtTime(r.requestedCheckOut, timeFormat)}
                      </p>
                      {r.decisionNote ? <p className="mt-0.5 text-[11px] text-muted-foreground">“{r.decisionNote}”</p> : null}
                    </div>
                  ))}
                </div>
              </>
            )
          }
        </DataState>
      </SectionCard>

      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setErrors({}); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" /> Request Regularization
            </DialogTitle>
            <DialogDescription>
              Correct a missing or incorrect punch. Applies only to past working days; your manager approves the change.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="reg-date">Date</Label>
              <Input
                id="reg-date" type="date" max={yesterday} value={form.date}
                onChange={(e) => onDateChange(e.target.value)}
              />
              {errors.date ? <p className="text-xs text-danger">{errors.date}</p> : null}
              {currentDay ? (
                <p className="text-[11px] text-muted-foreground">
                  Recorded punches: in {fmtTime(currentDay.firstCheckIn, timeFormat)} · out {fmtTime(currentDay.lastCheckOut, timeFormat)}
                  {currentDay.status === "MP" ? " · missing punch day" : ""}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="reg-in">Requested Check-in</Label>
                <Input
                  id="reg-in" type="time" value={inValue}
                  onChange={(e) => setForm((f) => ({ ...f, inTime: e.target.value }))}
                />
                {errors.inTime ? <p className="text-xs text-danger">{errors.inTime}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-out">Requested Check-out</Label>
                <Input
                  id="reg-out" type="time" value={outValue}
                  onChange={(e) => setForm((f) => ({ ...f, outTime: e.target.value }))}
                />
                {errors.outTime ? <p className="text-xs text-danger">{errors.outTime}</p> : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reg-reason">Reason</Label>
              <Textarea
                id="reg-reason" rows={3} placeholder="e.g. Forgot to punch out after the client call"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                onBlur={() => {
                  if (form.reason.trim().length > 0 && form.reason.trim().length < 3) {
                    setErrors((er) => ({ ...er, reason: "Reason must be at least 3 characters." }));
                  } else {
                    setErrors((er) => ({ ...er, reason: undefined }));
                  }
                }}
              />
              {errors.reason ? <p className="text-xs text-danger">{errors.reason}</p> : null}
            </div>

            <p className="flex items-center gap-1.5 rounded-lg bg-info-soft px-2.5 py-2 text-[11px] text-info">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              Approval flow: Manager review → HR verification → punches updated.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
