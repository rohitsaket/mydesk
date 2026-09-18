"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet, apiPost, ApiError } from "@/lib/hrms/client";
import type { AttendanceToday } from "@/lib/hrms/types";
import { fmtClock, fmtTime, fmtDuration, BREAK_TYPE_LABELS } from "@/lib/hrms/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlarmClock, Coffee, LogIn, LogOut, Loader2, AlertTriangle, Timer,
  Coffee as CoffeeIcon, Utensils, PersonStanding, Moon, Briefcase, Sparkles,
} from "lucide-react";

const BREAK_OPTIONS = [
  { value: "TEA", label: "Tea Break", icon: Coffee },
  { value: "LUNCH", label: "Lunch Break", icon: Utensils },
  { value: "PERSONAL", label: "Personal Break", icon: PersonStanding },
  { value: "PRAYER", label: "Prayer Break", icon: Moon },
  { value: "OFFICIAL", label: "Official Break", icon: Briefcase },
];

export function useAttendanceToday() {
  const setServerClock = useHrmsStore((s) => s.syncServerTime);
  const query = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: async () => {
      const data = await apiGet<AttendanceToday>("/api/attendance/today");
      setServerClock(data.serverTime);
      return data;
    },
    refetchInterval: 120_000,
  });
  return query;
}

/** Live ticking seconds since a base timestamp. */
function useTick(): number {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

export function AttendanceHero() {
  const query = useAttendanceToday();
  const queryClient = useQueryClient();
  const { now, timeFormat, employee } = useHrmsStore();
  const tick = useTick();
  const [actionPending, setActionPending] = useState<null | "checkin" | "break-start" | "break-end" | "checkout">(null);
  const [breakDialogOpen, setBreakDialogOpen] = useState(false);
  const [breakType, setBreakType] = useState("LUNCH");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutReason, setCheckoutReason] = useState("");

  const att = query.data;
  // Align local tick to server clock
  const nowMs = useMemo(() => tick - (Date.now() - now().getTime()), [tick, now]);

  // live derived values
  const live = useMemo(() => {
    if (!att) return null;
    const fetchedAt = att.serverTime;
    const elapsedSinceFetch = Math.max(0, (nowMs - fetchedAt) / 1000);
    let workedSec = att.workedMinutes * 60;
    if (att.state === "WORKING") workedSec += elapsedSinceFetch;
    let breakSec = (att.breakMinutes * 60);
    if (att.state === "ON_BREAK" && att.currentBreak) {
      breakSec += Math.max(0, (nowMs - new Date(att.currentBreak.startedAt).getTime()) / 1000);
    }
    const remainingSec = Math.max(0, att.requiredMinutes * 60 - workedSec);
    const breakNowSec = att.currentBreak
      ? Math.max(0, (nowMs - new Date(att.currentBreak.startedAt).getTime()) / 1000)
      : 0;
    return { workedSec: Math.floor(workedSec), breakSec: Math.floor(breakSec), remainingSec: Math.floor(remainingSec), breakNowSec: Math.floor(breakNowSec) };
  }, [att, nowMs]);

  async function punch(action: "checkin" | "break-start" | "break-end" | "checkout", url: string, body?: unknown) {
    if (actionPending) return;
    setActionPending(action);
    try {
      await apiPost(url, body);
      await queryClient.invalidateQueries({ queryKey: ["attendance", "today"] });
      await queryClient.invalidateQueries({ queryKey: ["desk"] });
    } catch (err) {
      const e = err as ApiError;
      toast.error(e.message || "Action failed", { description: "Your attendance status may have changed. Refreshing status…" });
      await query.refetch();
    } finally {
      setActionPending(null);
    }
  }

  async function doCheckIn() {
    await punch("checkin", "/api/attendance/check-in");
    toast.success(`Checked in at ${fmtTime(new Date(), timeFormat)}`, {
      description: "Have a productive day! Your live workday timer has started.",
    });
  }

  async function doBreakStart() {
    setBreakDialogOpen(false);
    await punch("break-start", "/api/attendance/break-start", { breakType });
    toast.success(`${BREAK_TYPE_LABELS[breakType]} started`, { description: "Timer paused — take a well-deserved break." });
  }

  async function doBreakEnd() {
    await punch("break-end", "/api/attendance/break-end");
    toast.success("Back to work", { description: "Break ended and work timer resumed." });
  }

  async function doCheckOut() {
    const reason = checkoutReason.trim();
    setCheckoutOpen(false);
    await punch("checkout", "/api/attendance/check-out", reason ? { reason } : undefined);
    toast.success("Checked out", { description: "Your attendance summary has been saved. See you tomorrow!" });
    setCheckoutReason("");
  }

  if (!att || !live) {
    return (
      <Card className="shadow-none">
        <CardContent className="flex h-64 items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const state = att.state;
  const onBreak = state === "ON_BREAK";
  const working = state === "WORKING";
  const notStarted = state === "NOT_STARTED";
  const done = state === "CHECKED_OUT";
  const statusTone = notStarted ? "muted" : onBreak ? "warning" : done ? "neutral" : working ? "success" : "neutral";

  const greeting = new Date().getHours();
  const timeOfDay = fmtTime(now(), timeFormat);
  void greeting; void timeOfDay;

  return (
    <Card className="relative overflow-hidden shadow-none">
      {/* subtle header band */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Today&apos;s Workday</p>
          {working ? <span className="live-dot h-2 w-2 rounded-full bg-success" aria-label="Live" /> : null}
        </div>
        <div className="flex items-center gap-2">
          {att.shift ? (
            <span className="text-xs font-medium text-muted-foreground tabular">
              {att.shift.name} · {att.shift.startTime} → {att.shift.endTime}
            </span>
          ) : null}
        </div>
      </div>

      <CardContent className="p-5">
        {/* status + big timer */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                  statusTone === "success" && "border-success/25 bg-success-soft text-success",
                  statusTone === "warning" && "border-warning/25 bg-warning-soft text-[#B54708]",
                  statusTone === "muted" && "border-border bg-muted text-muted-foreground",
                  statusTone === "neutral" && "border-border bg-muted text-muted-foreground"
                )}
                aria-live="polite"
              >
                {working ? <Timer className="h-3 w-3" /> : onBreak ? <CoffeeIcon className="h-3 w-3" /> : null}
                {att.statusLabel}
              </span>
              {att.lateMinutes > 0 && !notStarted ? (
                <span className="text-[11px] font-medium text-warning">Late by {fmtDuration(att.lateMinutes)}</span>
              ) : null}
              {att.overtimeMinutes > 0 ? (
                <span className="text-[11px] font-medium text-success">Overtime +{fmtDuration(att.overtimeMinutes)}</span>
              ) : null}
            </div>

            {onBreak && att.currentBreak ? (
              <>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {att.currentBreak.label}
                </p>
                <p className={cn("font-mono text-4xl font-semibold tracking-tight tabular sm:text-5xl", att.currentBreak.exceeded ? "text-warning" : "text-foreground")}>
                  {fmtClock(live.breakNowSec)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Started {fmtTime(att.currentBreak.startedAt, timeFormat)}
                  {att.shift ? ` · allowance ${att.shift.breakAllowanceMinutes}m` : ""}
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {notStarted ? "Not checked in" : done ? "Worked today" : "Working hours"}
                </p>
                <p className="font-mono text-4xl font-semibold tracking-tight tabular text-foreground sm:text-5xl" aria-label="Live working timer">
                  {fmtClock(notStarted ? 0 : live.workedSec)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="tabular">Checked In {fmtTime(att.firstCheckIn, timeFormat)}</span>
                  <span className="tabular">Expected Checkout {fmtTime(att.expectedCheckOut, timeFormat)}</span>
                </div>
              </>
            )}
          </div>

          {/* circular day progress — compact ring on the right */}
          <div className="hidden shrink-0 sm:block">
            <DayRing percent={Math.min(100, att.progressPercent)} label={onBreak ? "Break" : done ? "Done" : working ? "Shift" : "Idle"} />
          </div>
        </div>

        {/* progress bar */}
        {!notStarted ? (
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Shift progress</span>
              <span className="tabular font-medium text-foreground">{Math.min(100, att.progressPercent)}%</span>
            </div>
            <Progress value={Math.min(100, att.progressPercent)} className="h-2" aria-label="Shift progress" />
          </div>
        ) : null}

        {/* warning */}
        {att.warning ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-[#B54708]">{att.warning}</p>
          </div>
        ) : null}

        {/* actions */}
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          {notStarted ? (
            <Button
              size="lg"
              className="h-11 flex-1 gap-2 text-sm font-semibold"
              disabled={actionPending !== null}
              onClick={doCheckIn}
              data-testid="check-in-button"
            >
              {actionPending === "checkin" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {actionPending === "checkin" ? "Checking in…" : "Check In"}
            </Button>
          ) : null}

          {working ? (
            <Button
              size="lg"
              variant="outline"
              className="h-11 flex-1 gap-2 border-warning/30 bg-warning-soft text-[#B54708] hover:bg-warning-soft/80 hover:text-[#B54708]"
              disabled={actionPending !== null}
              onClick={() => setBreakDialogOpen(true)}
            >
              <Coffee className="h-4 w-4" /> Take Break
            </Button>
          ) : null}

          {onBreak ? (
            <Button
              size="lg"
              className="h-11 flex-1 gap-2 text-sm font-semibold"
              disabled={actionPending !== null}
              onClick={doBreakEnd}
            >
              {actionPending === "break-end" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Timer className="h-4 w-4" />}
              {actionPending === "break-end" ? "Resuming…" : "End Break"}
            </Button>
          ) : null}

          {(working || onBreak) ? (
            <Button
              size="lg"
              variant="outline"
              className="h-11 flex-1 gap-2 text-sm font-semibold"
              disabled={actionPending !== null}
              onClick={() => setCheckoutOpen(true)}
              data-testid="check-out-button"
            >
              <LogOut className="h-4 w-4" /> Check Out
            </Button>
          ) : null}

          {done ? (
            <div className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <AlarmClock className="h-4 w-4" />
              <span className="tabular">Checked out at {fmtTime(att.lastCheckOut, timeFormat)}</span>
            </div>
          ) : null}
        </div>
      </CardContent>

      {/* ── break dialog ── */}
      <Dialog open={breakDialogOpen} onOpenChange={setBreakDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Coffee className="h-4 w-4 text-primary" /> Start a break</DialogTitle>
            <DialogDescription>
              Your working timer pauses during breaks. Break allowance: {att.shift?.breakAllowanceMinutes ?? 60} minutes per day.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={breakType} onValueChange={setBreakType} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BREAK_OPTIONS.map((b) => (
              <label
                key={b.value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center text-xs font-medium transition-colors",
                  breakType === b.value ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
              >
                <RadioGroupItem value={b.value} className="sr-only" />
                <b.icon className={cn("h-4 w-4", breakType === b.value ? "text-primary" : "text-muted-foreground")} />
                {b.label}
              </label>
            ))}
          </RadioGroup>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setBreakDialogOpen(false)}>Cancel</Button>
            <Button onClick={doBreakStart} disabled={actionPending !== null} className="gap-2">
              {actionPending === "break-start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coffee className="h-4 w-4" />}
              Start {BREAK_TYPE_LABELS[breakType]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── checkout confirmation dialog ── */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm checkout</DialogTitle>
            <DialogDescription>
              Please review today&apos;s summary before checking out.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border">
            <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
              <div className="px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Check-in</p>
                <p className="mt-0.5 text-sm font-semibold tabular">{fmtTime(att.firstCheckIn, timeFormat)}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Required</p>
                <p className="mt-0.5 text-sm font-semibold tabular">{fmtDuration(att.requiredMinutes)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Worked (net)</p>
                <p className="mt-0.5 text-sm font-semibold tabular text-success">{fmtDuration(live.workedSec / 60)}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Break</p>
                <p className="mt-0.5 text-sm font-semibold tabular">{fmtDuration(live.breakSec / 60)}</p>
              </div>
            </div>
          </div>

          {live.remainingSec > 90 ? (
            <div className="space-y-3 rounded-lg border border-warning/25 bg-warning-soft p-3.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-xs leading-relaxed text-[#B54708]">
                  Your required working hours are not yet complete. Remaining:{" "}
                  <strong className="tabular">{fmtDuration(Math.ceil(live.remainingSec / 60))}</strong>.
                  Early checkout may affect your payable hours.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="early-reason" className="text-xs font-medium text-[#B54708]">
                  Reason for early checkout <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="early-reason"
                  placeholder="e.g. Medical appointment approved by manager"
                  value={checkoutReason}
                  onChange={(e) => setCheckoutReason(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-success" />
              All required hours completed{live.remainingSec > 0 ? ` — ${fmtDuration(Math.ceil(live.remainingSec / 60))} remaining` : ""}.
            </p>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={doCheckOut}
              disabled={actionPending !== null || (live.remainingSec > 90 && checkoutReason.trim().length < 3)}
              className="gap-2"
            >
              {actionPending === "checkout" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Continue Checkout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DayRing({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24" role="img" aria-label={`${label} progress ${clamped}%`}>
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
        <circle cx="42" cy="42" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="42" cy="42" r={r} fill="none" strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular">{clamped}%</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
