"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/hrms/client";
import { fmtDuration, parseHHMM, addDays, dayIST } from "@/lib/hrms/time";
import {
  PageHeader, StatCard, StatusBadge, DataState, DataSkeleton,
} from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FileClock, ChevronLeft, ChevronRight, Plus, Loader2, Trash2, Pencil, SendHorizonal,
  Clock, CircleCheck, CircleAlert, IndianRupee, CalendarDays, Download,
} from "lucide-react";

// ── types ───────────────────────────────────────────────────
interface TsEntry {
  id: string;
  date: string;
  project: string;
  taskName: string | null;
  description: string | null;
  startMinutes: number;
  endMinutes: number;
  minutes: number;
  billable: boolean;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
}

interface TsWeek {
  weekStart: string;
  weekEnd: string;
  days: { date: string; entries: TsEntry[] }[];
  totals: { minutes: number; billableMinutes: number; byProject: { project: string; minutes: number }[] };
  weekStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  rejectionNote: string | null;
  counts: { draft: number; submitted: number };
}

const PROJECTS = ["Project Alpha", "Internal", "Support", "Training"];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── date helpers (IST, UTC-midnight days) ───────────────────
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayOf(day: Date): Date {
  return addDays(day, -((day.getUTCDay() + 6) % 7));
}

function parseIsoDay(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

function weekLabel(start: Date, end: Date): string {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  if (sameMonth) return `${start.getUTCDate()} – ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
  return `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} – ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

function fmtMinutes(mins: number, timeFormat: "12h" | "24h"): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (timeFormat === "24h") return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── main view ───────────────────────────────────────────────
export default function TimesheetView() {
  const timeFormat = useHrmsStore((s) => s.timeFormat);
  const openForm = useHrmsStore((s) => s.openForm);
  const setOpenForm = useHrmsStore((s) => s.setOpenForm);
  const queryClient = useQueryClient();

  const [weekStart, setWeekStart] = useState<string>(() => isoDay(mondayOf(dayIST())));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TsEntry | null>(null);
  const [presetDate, setPresetDate] = useState<string | null>(null);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TsEntry | null>(null);

  const query = useQuery({
    queryKey: ["timesheet", weekStart],
    queryFn: () => apiGet<TsWeek>(`/api/timesheet?weekStart=${weekStart}`),
    staleTime: 30_000,
  });

  const todayIso = isoDay(dayIST());
  const isCurrentWeek = weekStart === isoDay(mondayOf(dayIST()));
  const weekDays = useMemo(() => query.data?.days.slice(0, 6) ?? [], [query.data]);

  // auto-open add-entry dialog when navigated with a form trigger (quick create)
  useEffect(() => {
    if (!openForm) return;
    // deferred so the dialog mount happens outside the effect body
    const t = setTimeout(() => {
      setEditing(null);
      setPresetDate(todayIso);
      setFormOpen(true);
      setOpenForm(null);
    }, 0);
    return () => clearTimeout(t);
  }, [openForm, setOpenForm, todayIso]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["timesheet"] });
    void queryClient.invalidateQueries({ queryKey: ["desk"] });
  };

  const shiftWeek = (delta: number) => {
    setWeekStart((cur) => isoDay(addDays(parseIsoDay(cur), 7 * delta)));
  };

  const submitWeekMutation = useMutation({
    mutationFn: () => apiPost<{ submitted: number }>("/api/timesheet", { action: "submit-week", weekStart }),
    onSuccess: (res) => {
      toast.success("Timesheet submitted for approval", { description: `${res.submitted} entr${res.submitted === 1 ? "y" : "ies"} sent to your manager.` });
      setSubmitConfirm(false);
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not submit the week.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: boolean }>(`/api/timesheet/${id}`),
    onSuccess: () => {
      toast.success("Entry deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not delete the entry.");
    },
  });

  const draftCount = query.data?.counts.draft ?? 0;

  // ── CSV export (client-side from loaded week data) ──────────
  function exportCsv() {
    const data = query.data;
    if (!data) return;
    const rows: string[][] = [["Date", "Day", "Project", "Task", "Description", "Start", "End", "Hours", "Billable", "Status"]];
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    for (const day of data.days) {
      for (const e of day.entries) {
        rows.push([
          day.date,
          WEEKDAY_SHORT[(parseIsoDay(day.date).getUTCDay() + 6) % 7] ?? "",
          e.project,
          e.taskName ?? "",
          e.description ?? "",
          hhmm(e.startMinutes),
          hhmm(e.endMinutes),
          (e.minutes / 60).toFixed(2),
          e.billable ? "Yes" : "No",
          e.status,
        ]);
      }
    }
    rows.push([]);
    rows.push(["", "", "", "", "TOTAL", "", "", (data.totals.minutes / 60).toFixed(2), `${data.totals.billableMinutes} billable min`, data.weekStatus]);
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${data.weekStart}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV exported", { description: `timesheet-${data.weekStart}.csv downloaded with ${data.days.reduce((n, d) => n + d.entries.length, 0)} entries.` });
  }

  const totalEntries = query.data?.days.reduce((n, d) => n + d.entries.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Timesheet"
        subtitle="Weekly effort log · Monday to Saturday"
        icon={<FileClock className="h-4.5 w-4.5" />}
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftWeek(-1)} aria-label="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[7.5rem] px-1 text-center text-xs font-semibold tabular text-foreground">
                {query.data ? weekLabel(parseIsoDay(query.data.weekStart), parseIsoDay(query.data.weekEnd)) : "…"}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftWeek(1)} aria-label="Next week">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={isCurrentWeek} onClick={() => setWeekStart(isoDay(mondayOf(dayIST())))}>
                <CalendarDays className="h-3 w-3" /> This week
              </Button>
            </div>
            {totalEntries > 0 ? (
              <Button variant="outline" size="sm" className="h-8 gap-1" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            ) : null}
            {draftCount > 0 ? (
              <Button size="sm" className="h-8 gap-1" onClick={() => setSubmitConfirm(true)}>
                <SendHorizonal className="h-3.5 w-3.5" /> Submit Week
              </Button>
            ) : null}
          </>
        }
      />

      <DataState query={query} skeleton={<DataSkeleton />}>
        {(data) => (
          <>
            {data.weekStatus !== "DRAFT" ? <WeekBanner status={data.weekStatus} note={data.rejectionNote} /> : null}

            <div className="space-y-2">
              {weekDays.map((day, i) => (
                <DayCard
                  key={day.date}
                  day={day}
                  dayIndex={i}
                  isToday={day.date === todayIso}
                  timeFormat={timeFormat}
                  onAdd={() => { setEditing(null); setPresetDate(day.date); setFormOpen(true); }}
                  onEdit={(e) => { setEditing(e); setPresetDate(null); setFormOpen(true); }}
                  onDelete={(e) => setDeleteTarget(e)}
                />
              ))}
            </div>

            <WeekTotals totals={data.totals} />
          </>
        )}
      </DataState>

      <EntryFormDialog
        key={editing?.id ?? `new-${presetDate ?? "none"}`}
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) { setEditing(null); setPresetDate(null); } }}
        editing={editing}
        presetDate={presetDate}
        weekDays={weekDays.map((d) => d.date)}
        onDone={invalidate}
      />

      <AlertDialog open={submitConfirm} onOpenChange={setSubmitConfirm}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this week for approval?</AlertDialogTitle>
            <AlertDialogDescription>
              All {draftCount} draft {draftCount === 1 ? "entry" : "entries"} for the week of {query.data ? weekLabel(parseIsoDay(query.data.weekStart), parseIsoDay(query.data.weekEnd)) : ""} will be
              locked and routed to your manager. Submitted entries can no longer be edited or deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction disabled={submitWeekMutation.isPending} onClick={(e) => { e.preventDefault(); submitWeekMutation.mutate(); }}>
              {submitWeekMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="mr-1.5 h-3.5 w-3.5" />}
              Submit Week
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `${fmtMinutes(deleteTarget.startMinutes, timeFormat)} – ${fmtMinutes(deleteTarget.endMinutes, timeFormat)} · ${deleteTarget.project}` : ""}
              {" "}will be removed from your draft timesheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Entry</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── week status banner ──────────────────────────────────────
function WeekBanner({ status, note }: { status: string; note: string | null }) {
  if (status === "SUBMITTED") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-[#B54708]">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Week submitted · awaiting manager approval</p>
          <p className="text-xs text-[#B54708]/80">Entries are locked. You will be notified once reviewed.</p>
        </div>
      </div>
    );
  }
  if (status === "APPROVED") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-success">
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Week approved</p>
          <p className="text-xs text-success/80">Your logged hours have been accepted for payroll.</p>
        </div>
      </div>
    );
  }
  if (status === "REJECTED") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-danger">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Week rejected by manager</p>
          {note ? <p className="text-xs text-danger/80">Note: {note}</p> : <p className="text-xs text-danger/80">Please review and re-submit the corrected week.</p>}
        </div>
      </div>
    );
  }
  return null;
}

// ── day card ────────────────────────────────────────────────
function DayCard({
  day, dayIndex, isToday, timeFormat, onAdd, onEdit, onDelete,
}: {
  day: { date: string; entries: TsEntry[] };
  dayIndex: number;
  isToday: boolean;
  timeFormat: "12h" | "24h";
  onAdd: () => void;
  onEdit: (e: TsEntry) => void;
  onDelete: (e: TsEntry) => void;
}) {
  const d = parseIsoDay(day.date);
  const dayTotal = day.entries.reduce((s, e) => s + e.minutes, 0);
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-none", isToday && "border-primary/40")}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={cn("text-sm font-semibold capitalize", isToday ? "text-primary" : "text-foreground")}>
            {WEEKDAY_SHORT[dayIndex]}
          </span>
          <span className="text-xs text-muted-foreground tabular">{d.getUTCDate()} {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]}</span>
          {isToday ? (
            <span className="rounded-full bg-primary/10 px-1.5 py-[1px] text-[10px] font-semibold text-primary">Today</span>
          ) : null}
          {dayTotal > 0 ? (
            <span className="text-[11px] text-muted-foreground tabular">· {fmtDuration(dayTotal)}</span>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 text-xs" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add entry
        </Button>
      </div>

      {day.entries.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">No time logged for this day.</p>
      ) : (
        <div className="divide-y divide-border">
          {day.entries.map((e) => (
            <EntryRow key={e.id} entry={e} timeFormat={timeFormat} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry, timeFormat, onEdit, onDelete,
}: {
  entry: TsEntry;
  timeFormat: "12h" | "24h";
  onEdit: (e: TsEntry) => void;
  onDelete: (e: TsEntry) => void;
}) {
  const editable = entry.status === "DRAFT";
  return (
    <div className={cn("flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3", !editable && "opacity-80")}>
      <span className="shrink-0 text-xs font-semibold tabular text-foreground sm:w-32">
        {fmtMinutes(entry.startMinutes, timeFormat)} – {fmtMinutes(entry.endMinutes, timeFormat)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-muted px-2 py-[1px] text-[10px] font-medium text-muted-foreground">{entry.project}</span>
          {entry.taskName ? <span className="truncate text-xs font-medium text-foreground">{entry.taskName}</span> : null}
        </div>
        {entry.description ? <p className="truncate text-[11px] text-muted-foreground">{entry.description}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        <span className="text-xs font-semibold tabular text-foreground">{fmtDuration(entry.minutes)}</span>
        {entry.billable ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-success-soft px-1.5 py-[1px] text-[9px] font-semibold text-success">
            <IndianRupee className="h-2.5 w-2.5" /> Billable
          </span>
        ) : (
          <span className="rounded-full bg-muted px-1.5 py-[1px] text-[9px] font-medium text-muted-foreground">Non-billable</span>
        )}
        <StatusBadge status={entry.status} />
        {editable ? (
          <span className="flex items-center gap-0.5">
            <Button
              variant="ghost" size="icon" className="h-6.5 w-6.5 text-muted-foreground hover:text-foreground"
              aria-label="Edit entry" title="Edit entry"
              onClick={() => onEdit(entry)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-6.5 w-6.5 text-muted-foreground hover:text-danger"
              aria-label="Delete entry" title="Delete entry"
              onClick={() => onDelete(entry)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ── week totals ─────────────────────────────────────────────
function WeekTotals({ totals }: { totals: TsWeek["totals"] }) {
  const hours = Math.round((totals.minutes / 60) * 10) / 10;
  const billableHours = Math.round((totals.billableMinutes / 60) * 10) / 10;
  const billablePct = totals.minutes > 0 ? Math.round((totals.billableMinutes / totals.minutes) * 100) : 0;
  const maxProject = Math.max(1, ...totals.byProject.map((p) => p.minutes));

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard label="Total Hours" value={`${hours}h`} hint="Mon – Sat logged effort" icon={<Clock className="h-3.5 w-3.5" />} />
      <StatCard label="Billable Hours" value={`${billableHours}h`} tone="success" hint={`${billablePct}% of logged time`} icon={<IndianRupee className="h-3.5 w-3.5" />} />
      <div className="rounded-xl border border-border bg-card p-4 shadow-none">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">By Project</p>
          <span className="text-[11px] text-muted-foreground">{totals.byProject.length} project{totals.byProject.length === 1 ? "" : "s"}</span>
        </div>
        {totals.byProject.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No entries this week.</p>
        ) : (
          <div className="mt-2.5 space-y-2">
            {totals.byProject.map((p) => (
              <div key={p.project} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[11px] font-medium text-foreground">{p.project}</span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(p.minutes / maxProject) * 100}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right text-[11px] tabular text-muted-foreground">{fmtDuration(p.minutes)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── add / edit entry dialog ─────────────────────────────────
function EntryFormDialog({
  open, onOpenChange, editing, presetDate, weekDays, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: TsEntry | null;
  presetDate: string | null;
  weekDays: string[];
  onDone: () => void;
}) {
  const defaultDate = presetDate ?? editing?.date ?? weekDays[0] ?? "";
  const [date, setDate] = useState<string>(defaultDate);
  const [projectChoice, setProjectChoice] = useState<string>(
    editing ? (PROJECTS.includes(editing.project) ? editing.project : "Other") : "Project Alpha"
  );
  const [customProject, setCustomProject] = useState<string>(
    editing && !PROJECTS.includes(editing.project) ? editing.project : ""
  );
  const [taskName, setTaskName] = useState(editing?.taskName ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [start, setStart] = useState(
    editing ? `${String(Math.floor(editing.startMinutes / 60)).padStart(2, "0")}:${String(editing.startMinutes % 60).padStart(2, "0")}` : "09:30"
  );
  const [end, setEnd] = useState(
    editing ? `${String(Math.floor(editing.endMinutes / 60)).padStart(2, "0")}:${String(editing.endMinutes % 60).padStart(2, "0")}` : "13:00"
  );
  const [billable, setBillable] = useState(editing?.billable ?? true);
  const [errors, setErrors] = useState<{ project?: string; time?: string }>({});

  const startMinutes = parseHHMM(start);
  const endMinutes = parseHHMM(end);
  const duration = endMinutes > startMinutes ? endMinutes - startMinutes : 0;
  const timeInvalid = !!start && !!end && endMinutes <= startMinutes;

  const reset = () => {
    setDate(defaultDate);
    setProjectChoice(editing ? (PROJECTS.includes(editing.project) ? editing.project : "Other") : "Project Alpha");
    setCustomProject(editing && !PROJECTS.includes(editing.project) ? editing.project : "");
    setTaskName("");
    setDescription("");
    setStart("09:30");
    setEnd("13:00");
    setBillable(true);
    setErrors({});
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<TsEntry>("/api/timesheet", payload),
    onSuccess: () => {
      toast.success("Timesheet entry added", { description: `${fmtDuration(duration)} · ${projectLabel()}` });
      onOpenChange(false);
      onDone();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not add the entry.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPatch<TsEntry>(`/api/timesheet/${editing?.id}`, payload),
    onSuccess: () => {
      toast.success("Entry updated", { description: `${fmtDuration(duration)} · ${projectLabel()}` });
      onOpenChange(false);
      onDone();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not update the entry.");
    },
  });

  function projectLabel(): string {
    return projectChoice === "Other" ? (customProject.trim() || "Other") : projectChoice;
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const errs: { project?: string; time?: string } = {};
    if (projectChoice === "Other" && !customProject.trim()) errs.project = "Enter the project name";
    if (!start || !end) errs.time = "Both start and end times are required";
    else if (endMinutes <= startMinutes) errs.time = "End time must be after start time";
    setErrors(errs);
    if (errs.project || errs.time) return;

    const payload: Record<string, unknown> = {
      project: projectLabel(),
      taskName: taskName.trim() ? taskName.trim() : null,
      description: description.trim() ? description.trim() : null,
      startMinutes,
      endMinutes,
      billable,
    };
    if (editing) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate({ ...payload, date });
    }
  }

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Entry" : "Add Timesheet Entry"}</DialogTitle>
          <DialogDescription>
            {editing ? "Draft entries can be edited until the week is submitted." : "Log effort against a project for the selected day."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Date</Label>
              {editing ? (
                <div className="flex h-8 items-center rounded-md border border-border bg-muted/50 px-3 text-xs text-muted-foreground tabular">{editing.date}</div>
              ) : (
                <Select value={date} onValueChange={setDate}>
                  <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {weekDays.map((d, i) => (
                      <SelectItem key={d} value={d}>
                        {WEEKDAY_SHORT[i]}, {d.slice(8)} {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(d.slice(5, 7)) - 1]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Project *</Label>
              <Select value={projectChoice} onValueChange={(v) => { setProjectChoice(v); setErrors((e) => ({ ...e, project: undefined })); }}>
                <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECTS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                  <SelectItem value="Other">Other…</SelectItem>
                </SelectContent>
              </Select>
              {projectChoice === "Other" ? (
                <Input
                  value={customProject}
                  onChange={(e) => { setCustomProject(e.target.value); setErrors((er) => ({ ...er, project: undefined })); }}
                  placeholder="Project name"
                  className="h-8 text-xs"
                  aria-invalid={!!errors.project}
                />
              ) : null}
              {errors.project ? <p className="text-xs text-danger">{errors.project}</p> : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ts-task">Task</Label>
            <Input
              id="ts-task"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="e.g. Development, Client call, Bug fixing"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ts-desc">Description</Label>
            <Textarea
              id="ts-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={2}
              className="text-xs"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ts-start">Start time *</Label>
              <Input
                id="ts-start" type="time" value={start}
                onChange={(e) => { setStart(e.target.value); setErrors((er) => ({ ...er, time: undefined })); }}
                className="h-8 tabular"
                aria-invalid={timeInvalid}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ts-end">End time *</Label>
              <Input
                id="ts-end" type="time" value={end}
                onChange={(e) => { setEnd(e.target.value); setErrors((er) => ({ ...er, time: undefined })); }}
                className="h-8 tabular"
                aria-invalid={timeInvalid}
              />
              {errors.time ? <p className="text-xs text-danger">{errors.time}</p> : null}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="tabular font-semibold text-foreground">{duration > 0 ? fmtDuration(duration) : "—"}</span>
              <span className="text-xs text-muted-foreground">duration</span>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ts-billable" className="text-xs text-muted-foreground">Billable</Label>
              <Switch id="ts-billable" checked={billable} onCheckedChange={setBillable} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || timeInvalid}>
              {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : editing ? <Pencil className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              {editing ? "Save Entry" : "Add Entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
