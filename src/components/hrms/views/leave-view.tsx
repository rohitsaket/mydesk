"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet, apiPost, ApiError } from "@/lib/hrms/client";
import { fmtDate, fmtDateShort, dayIST } from "@/lib/hrms/time";
import {
  PageHeader, SectionCard, StatusBadge, EmptyState, DataState, StatCard,
} from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plane, CalendarPlus, Loader2, XCircle, ArrowRight, Info, FileText, UserCheck, Building2,
} from "lucide-react";

// ── types ───────────────────────────────────────────────────
interface LeaveBalance {
  leaveTypeId: string; name: string; code: string; color: string;
  entitled: number; used: number; pending: number; available: number;
}
interface LeaveRequestItem {
  id: string; code: string; leaveTypeId: string; leaveTypeName: string; leaveTypeColor: string;
  fromDate: string; toDate: string; dayMode: string; days: number; reason: string;
  status: string; currentStage: string; appliedAt: string; decidedAt: string | null;
  decisionNote: string | null; approverName: string | null; substituteName: string | null;
  contactDuringLeave: string | null; attachmentName: string | null;
}
interface LeaveData { balances: LeaveBalance[]; requests: LeaveRequestItem[] }
interface Substitute { id: string; name: string; designation: string }

type DayMode = "FULL" | "FIRST_HALF" | "SECOND_HALF";
const DAY_MODE_LABELS: Record<string, string> = {
  FULL: "Full day", FIRST_HALF: "First half", SECOND_HALF: "Second half",
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── main view ───────────────────────────────────────────────
export default function LeaveView() {
  const openForm = useHrmsStore((s) => s.openForm);
  const setOpenForm = useHrmsStore((s) => s.setOpenForm);
  const queryClient = useQueryClient();

  const [applyOpen, setApplyOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequestItem | null>(null);

  const leaveQuery = useQuery({
    queryKey: ["leave"],
    queryFn: () => apiGet<LeaveData>("/api/leave"),
  });

  // auto-open apply dialog when navigated with a form trigger (quick create / desk CTA)
  useEffect(() => {
    if (openForm !== "apply" && openForm !== "leave") return;
    // deferred so the dialog mount happens outside the effect body
    const t = setTimeout(() => {
      setApplyOpen(true);
      setOpenForm(null);
    }, 0);
    return () => clearTimeout(t);
  }, [openForm, setOpenForm]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["leave"] });
    void queryClient.invalidateQueries({ queryKey: ["desk"] });
  };

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ code: string }>("/api/leave", { action: "cancel", id }),
    onSuccess: (res) => {
      toast.success(`Leave request ${res.code} withdrawn`, { description: "Your blocked balance has been released." });
      setCancelTarget(null);
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not withdraw the request.");
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leave"
        subtitle="Balances, applications and approvals"
        icon={<Plane className="h-4.5 w-4.5" />}
        actions={
          <Button size="sm" onClick={() => setApplyOpen(true)}>
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Apply Leave
          </Button>
        }
      />

      <DataState query={leaveQuery}>
        {(data) => (
          <>
            <BalanceCards balances={data.balances} onApply={() => setApplyOpen(true)} />
            <RequestsList
              requests={data.requests}
              onCancel={(r) => setCancelTarget(r)}
            />
          </>
        )}
      </DataState>

      <ApplyLeaveDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        balances={leaveQuery.data?.balances ?? []}
        onApplied={invalidate}
      />

      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) setCancelTarget(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw leave request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will withdraw {cancelTarget?.code}. Your blocked balance will be released immediately. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Request</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              onClick={(e) => {
                e.preventDefault();
                if (cancelTarget) cancelMutation.mutate(cancelTarget.id);
              }}
            >
              {cancelMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── balance cards ───────────────────────────────────────────
function BalanceCards({ balances, onApply }: { balances: LeaveBalance[]; onApply: () => void }) {
  const totalAvailable = balances.reduce((a, b) => a + b.available, 0);
  if (balances.length === 0) {
    return (
      <EmptyState
        title="No leave balances yet" message="Your leave entitlements for this year will appear here."
        action={<Button size="sm" onClick={onApply}>Apply Leave</Button>}
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
        <StatCard label="Total Available" value={`${totalAvailable}`} hint="Day(s) across all types" tone="info" icon={<Plane className="h-3.5 w-3.5" />} />
        {balances.map((b) => (
          <div key={b.leaveTypeId} className="rounded-xl border border-border bg-card p-3.5 shadow-none">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                <p className="truncate text-xs font-semibold text-foreground">{b.name}</p>
              </div>
              <span className="shrink-0 rounded bg-muted px-1 py-[1px] text-[9px] font-semibold uppercase text-muted-foreground">{b.code}</span>
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular text-foreground">
              {b.available}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">of {b.entitled} days</span>
            </p>
            <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full" style={{ width: `${Math.min(100, (b.used / Math.max(1, b.entitled)) * 100)}%`, backgroundColor: b.color }} title={`Used ${b.used}`} />
              <div className="h-full opacity-40" style={{ width: `${Math.min(100, (b.pending / Math.max(1, b.entitled)) * 100)}%`, backgroundColor: b.color }} title={`Pending ${b.pending}`} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="tabular">Used {b.used}</span>
              <span className="tabular">Pending {b.pending}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Info className="h-3 w-3 shrink-0" />
        Available = entitled − used − pending. Pending days are blocked while requests await approval.
      </p>
    </div>
  );
}

// ── requests list ───────────────────────────────────────────
function stageChip(stage: string, status: string) {
  if (status !== "PENDING") {
    return <span className="rounded-full bg-muted px-1.5 py-[1px] text-[10px] font-medium text-muted-foreground">Completed</span>;
  }
  if (stage === "MANAGER") {
    return <span className="rounded-full bg-warning-soft px-1.5 py-[1px] text-[10px] font-medium text-[#B54708]">Manager Approval</span>;
  }
  return <span className="rounded-full bg-info-soft px-1.5 py-[1px] text-[10px] font-medium text-info">HR Review</span>;
}

function RequestsList({
  requests, onCancel,
}: { requests: LeaveRequestItem[]; onCancel: (r: LeaveRequestItem) => void }) {
  if (requests.length === 0) {
    return (
      <SectionCard title="My Requests">
        <EmptyState title="No leave requests" message="Your leave applications and their approval status will appear here." />
      </SectionCard>
    );
  }
  return (
    <SectionCard title="My Requests" contentClassName="pt-0">
      <TooltipProvider delayDuration={200}>
        {/* desktop table */}
        <div className="hidden max-h-96 overflow-y-auto scroll-thin md:block">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-semibold">{r.code}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.leaveTypeColor }} aria-hidden />
                      {r.leaveTypeName}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {fmtDateShort(r.fromDate)} → {fmtDateShort(r.toDate)}
                    <span className="ml-1.5 text-[10px] text-muted-foreground">{DAY_MODE_LABELS[r.dayMode] ?? r.dayMode}</span>
                  </TableCell>
                  <TableCell className="text-xs tabular font-medium">{r.days}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>{stageChip(r.currentStage, r.status)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDateShort(r.appliedAt)}</TableCell>
                  <TableCell className="text-right">
                    {r.status === "PENDING" ? (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onCancel(r)}>
                        <XCircle className="mr-1 h-3 w-3" /> Cancel
                      </Button>
                    ) : (
                      <DecisionNoteCell note={r.decisionNote} approver={r.approverName} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* mobile cards */}
        <div className="max-h-96 space-y-1.5 overflow-y-auto scroll-thin md:hidden">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="text-xs font-semibold">{r.code}</p>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.leaveTypeColor }} aria-hidden />
                    {r.leaveTypeName}
                  </span>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {fmtDateShort(r.fromDate)} → {fmtDateShort(r.toDate)} · {r.days} day(s) · {DAY_MODE_LABELS[r.dayMode] ?? r.dayMode}
              </p>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{r.reason}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                {stageChip(r.currentStage, r.status)}
                {r.status === "PENDING" ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-danger" onClick={() => onCancel(r)}>
                    <XCircle className="mr-1 h-3 w-3" /> Cancel
                  </Button>
                ) : (
                  <DecisionNoteCell note={r.decisionNote} approver={r.approverName} />
                )}
              </div>
            </div>
          ))}
        </div>
      </TooltipProvider>
    </SectionCard>
  );
}

function DecisionNoteCell({ note, approver }: { note: string | null; approver: string | null }) {
  if (!note) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="max-w-[140px] truncate text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
          {note}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs">
        <p>{note}</p>
        {approver ? <p className="mt-0.5 text-[10px] text-muted-foreground">— {approver}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}

// ── apply leave dialog ──────────────────────────────────────
function ApplyLeaveDialog({
  open, onOpenChange, balances, onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  balances: LeaveBalance[];
  onApplied: () => void;
}) {
  const today = useMemo(() => isoDay(dayIST(new Date())), []);
  const [form, setForm] = useState({
    leaveTypeId: "", fromDate: "", toDate: "", dayMode: "FULL" as DayMode,
    reason: "", contact: "", substituteId: "none", attachmentName: "",
  });
  const [errors, setErrors] = useState<{ leaveTypeId?: string; dates?: string; reason?: string; balance?: string }>({});

  const subsQuery = useQuery({
    queryKey: ["leave", "substitutes"],
    queryFn: () => apiGet<{ substitutes: Substitute[] }>("/api/leave?action=substitutes"),
    enabled: open,
  });

  const selectedBalance = balances.find((b) => b.leaveTypeId === form.leaveTypeId) ?? null;

  const rangeDays = useMemo(() => {
    if (!form.fromDate || !form.toDate) return 0;
    const from = new Date(`${form.fromDate}T00:00:00Z`).getTime();
    const to = new Date(`${form.toDate}T00:00:00Z`).getTime();
    if (Number.isNaN(from) || Number.isNaN(to) || from > to) return 0;
    return Math.round((to - from) / 86400000) + 1;
  }, [form.fromDate, form.toDate]);
  const days = rangeDays * (form.dayMode === "FULL" ? 1 : 0.5);
  const balanceShort = selectedBalance ? days > selectedBalance.available : false;

  function reset() {
    setForm({ leaveTypeId: "", fromDate: "", toDate: "", dayMode: "FULL", reason: "", contact: "", substituteId: "none", attachmentName: "" });
    setErrors({});
  }

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ code: string; days: number }>("/api/leave", {
        action: "create",
        leaveTypeId: form.leaveTypeId,
        fromDate: form.fromDate,
        toDate: form.toDate || form.fromDate,
        dayMode: form.dayMode,
        reason: form.reason.trim(),
        contactDuringLeave: form.contact.trim() || undefined,
        substituteId: form.substituteId === "none" ? undefined : form.substituteId,
        attachmentName: form.attachmentName.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(`Leave request ${res.code} submitted`, {
        description: `${res.days} day(s) blocked · awaiting manager approval.`,
      });
      onOpenChange(false);
      reset();
      onApplied();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not submit the request.");
    },
  });

  function submit() {
    const errs: typeof errors = {};
    if (!form.leaveTypeId) errs.leaveTypeId = "Select a leave type.";
    if (!form.fromDate || !form.toDate) errs.dates = "Select both dates.";
    else if (form.fromDate > form.toDate) errs.dates = "From date cannot be after to date.";
    if (form.reason.trim().length < 5) errs.reason = "Reason must be at least 5 characters.";
    if (selectedBalance && days > selectedBalance.available) {
      errs.balance = `Only ${selectedBalance.available} day(s) available for ${selectedBalance.name}.`;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scroll-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" /> Apply for Leave
          </DialogTitle>
          <DialogDescription>Submit a leave request for manager and HR approval.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Leave Type</Label>
            <Select value={form.leaveTypeId} onValueChange={(v) => setForm((f) => ({ ...f, leaveTypeId: v }))}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {balances.map((b) => (
                  <SelectItem key={b.leaveTypeId} value={b.leaveTypeId}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                      {b.name}
                      <span className="text-[10px] text-muted-foreground">{b.available}d available</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.leaveTypeId ? <p className="text-xs text-danger">{errors.leaveTypeId}</p> : null}
            {selectedBalance ? (
              <p className="text-[11px] text-muted-foreground">
                {selectedBalance.available} of {selectedBalance.entitled} day(s) available · {selectedBalance.pending} pending
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lv-from">From</Label>
              <Input
                id="lv-from" type="date" value={form.fromDate}
                onChange={(e) => setForm((f) => ({
                  ...f, fromDate: e.target.value,
                  toDate: !f.toDate || f.toDate < e.target.value ? e.target.value : f.toDate,
                }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lv-to">To</Label>
              <Input
                id="lv-to" type="date" min={form.fromDate || today} value={form.toDate}
                onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
              />
            </div>
          </div>
          {errors.dates ? <p className="text-xs text-danger">{errors.dates}</p> : null}

          <div className="space-y-1.5">
            <Label>Day Mode</Label>
            <RadioGroup
              value={form.dayMode}
              onValueChange={(v) => setForm((f) => ({ ...f, dayMode: v as DayMode }))}
              className="grid grid-cols-3 gap-2"
            >
              {(["FULL", "FIRST_HALF", "SECOND_HALF"] as const).map((m) => (
                <label
                  key={m}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors",
                    form.dayMode === m ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  <RadioGroupItem value={m} id={`mode-${m}`} className="h-3.5 w-3.5" />
                  {DAY_MODE_LABELS[m]}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Total leave deducted</p>
            <p className={cn("text-sm font-semibold tabular", balanceShort ? "text-danger" : "text-foreground")}>
              {rangeDays > 0 ? `${days} day(s)` : "—"}
            </p>
          </div>
          {errors.balance ? <p className="text-xs text-danger">{errors.balance}</p> : null}

          <div className="space-y-1.5">
            <Label htmlFor="lv-reason">Reason</Label>
            <Textarea
              id="lv-reason" rows={3} placeholder="e.g. Family function at hometown"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              onBlur={() => {
                if (form.reason.trim().length > 0 && form.reason.trim().length < 5) {
                  setErrors((er) => ({ ...er, reason: "Reason must be at least 5 characters." }));
                } else {
                  setErrors((er) => ({ ...er, reason: undefined }));
                }
              }}
            />
            {errors.reason ? <p className="text-xs text-danger">{errors.reason}</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lv-contact">Contact During Leave</Label>
              <Input
                id="lv-contact" placeholder="+91 98765 43210" value={form.contact}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Substitute / Handover</Label>
              <Select value={form.substituteId} onValueChange={(v) => setForm((f) => ({ ...f, substituteId: v }))}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select coworker" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not required</SelectItem>
                  {(subsQuery.data?.substitutes ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lv-attach" className="flex items-center gap-1">
              <FileText className="h-3 w-3" /> Attachment <span className="font-normal text-muted-foreground">(file name)</span>
            </Label>
            <Input
              id="lv-attach" placeholder="e.g. medical-certificate.pdf" value={form.attachmentName}
              onChange={(e) => setForm((f) => ({ ...f, attachmentName: e.target.value }))}
            />
          </div>

          <div className="rounded-lg bg-info-soft px-3 py-2.5">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-info">
              <UserCheck className="h-3.5 w-3.5" /> Approval chain
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-info/90">
              <span className="rounded-full bg-background px-2 py-0.5 font-medium">You</span>
              <ArrowRight className="h-3 w-3" />
              <span className="rounded-full bg-background px-2 py-0.5 font-medium">Manager</span>
              <ArrowRight className="h-3 w-3" />
              <span className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 font-medium">
                <Building2 className="h-3 w-3" /> HR
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending || balanceShort}>
            {mutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
