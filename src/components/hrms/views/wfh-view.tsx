"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet, apiPost, ApiError } from "@/lib/hrms/client";
import { fmtDateShort, dayIST } from "@/lib/hrms/time";
import { PageHeader, SectionCard, StatusBadge, EmptyState, DataState, InfoRow } from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BriefcaseBusiness, Loader2, MapPin, Phone, ShieldCheck, XCircle, Home, Clock, Info } from "lucide-react";

// ── types ───────────────────────────────────────────────────
interface DutyItem {
  id: string; code: string; type: string; subtype: string | null;
  fromDate: string; toDate: string | null; hours: number | null; reason: string;
  destination: string | null; clientName: string | null; contact: string | null; address: string | null;
  status: string; appliedAt: string; decidedAt: string | null; decisionNote: string | null;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── main view ───────────────────────────────────────────────
export default function WfhView() {
  const openForm = useHrmsStore((s) => s.openForm);
  const setOpenForm = useHrmsStore((s) => s.setOpenForm);
  const queryClient = useQueryClient();

  const [applyOpen, setApplyOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DutyItem | null>(null);

  const listQuery = useQuery({
    queryKey: ["duty", "wfh"],
    queryFn: () => apiGet<{ requests: DutyItem[] }>("/api/duty-requests?type=WFH"),
  });

  // auto-open create dialog when navigated with a form trigger (quick create / desk CTA)
  useEffect(() => {
    if (openForm !== "apply" && openForm !== "wfh") return;
    // deferred so the dialog mount happens outside the effect body
    const t = setTimeout(() => {
      setApplyOpen(true);
      setOpenForm(null);
    }, 0);
    return () => clearTimeout(t);
  }, [openForm, setOpenForm]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["duty", "wfh"] });
    void queryClient.invalidateQueries({ queryKey: ["desk"] });
  };

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ code: string }>("/api/duty-requests", { action: "cancel", id }),
    onSuccess: (res) => {
      toast.success(`WFH request ${res.code} withdrawn`);
      setCancelTarget(null);
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not withdraw the request.");
    },
  });

  const requests = listQuery.data?.requests ?? [];
  const stats = {
    approved: requests.filter((r) => r.status === "APPROVED").length,
    pending: requests.filter((r) => r.status === "PENDING").length,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Work From Home"
        subtitle="Remote work requests and decisions"
        icon={<Home className="h-4.5 w-4.5" />}
        actions={
          <Button size="sm" onClick={() => setApplyOpen(true)}>
            <BriefcaseBusiness className="mr-1.5 h-3.5 w-3.5" /> Request WFH
          </Button>
        }
      />

      <SectionCard title="WFH Policy" icon={<ShieldCheck className="h-4 w-4 text-primary" />}>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <div className="space-y-0">
            <InfoRow label="Approval" value="Subject to manager approval" />
            <InfoRow label="Notice" value="Apply at least 1 day in advance" />
            <InfoRow label="Availability" value="Must stay reachable during shift hours" />
          </div>
          <div className="space-y-0">
            <InfoRow label="Approved so far" value={`${stats.approved} request(s)`} />
            <InfoRow label="Pending" value={`${stats.pending} request(s)`} />
            <InfoRow label="Punching" value="Web check-in still applies on WFH days" />
          </div>
        </div>
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-info-soft px-2.5 py-2 text-[11px] text-info">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          WFH days are marked in attendance once approved — no separate punch location is required.
        </p>
      </SectionCard>

      <SectionCard title="My WFH Requests" contentClassName="pt-0">
        <DataState query={listQuery} errorTitle="Unable to load WFH requests">
          {({ requests }) =>
            requests.length === 0 ? (
              <EmptyState
                title="No WFH requests"
                message="Raise a request when you need to work remotely for a day."
                action={<Button size="sm" variant="outline" onClick={() => setApplyOpen(true)}>Request WFH</Button>}
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
                        <TableHead>Hours</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Decision</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs font-semibold">{r.code}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {fmtDateShort(r.fromDate)}{r.toDate && r.toDate !== r.fromDate ? ` → ${fmtDateShort(r.toDate)}` : ""}
                          </TableCell>
                          <TableCell className="text-xs tabular">{r.hours ? `${r.hours}h` : "—"}</TableCell>
                          <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground" title={r.reason}>
                            {r.reason}
                          </TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={r.decisionNote ?? undefined}>
                            {r.decisionNote ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.status === "PENDING" ? (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setCancelTarget(r)}>
                                <XCircle className="mr-1 h-3 w-3" /> Cancel
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* mobile cards */}
                <div className="space-y-1.5 md:hidden">
                  {requests.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold">{r.code} · {fmtDateShort(r.fromDate)}</p>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{r.reason}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="tabular">{r.hours ? `${r.hours}h` : "Full day"}</span>
                        {r.status === "PENDING" ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-danger" onClick={() => setCancelTarget(r)}>
                            <XCircle className="mr-1 h-3 w-3" /> Cancel
                          </Button>
                        ) : r.decisionNote ? (
                          <span className="truncate italic">“{r.decisionNote}”</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          }
        </DataState>
      </SectionCard>

      <WfhDialog open={applyOpen} onOpenChange={setApplyOpen} onCreated={invalidate} />

      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) setCancelTarget(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw WFH request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will withdraw {cancelTarget?.code}. This action cannot be undone.
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

// ── request dialog ──────────────────────────────────────────
function WfhDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const today = isoDay(dayIST(new Date()));
  const [form, setForm] = useState({ date: "", duration: "FULL" as "FULL" | "HALF", reason: "", address: "", contact: "" });
  const [errors, setErrors] = useState<{ date?: string; reason?: string }>({});

  const hours = form.duration === "FULL" ? 8 : 4;

  function reset() {
    setForm({ date: "", duration: "FULL", reason: "", address: "", contact: "" });
    setErrors({});
  }

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ code: string }>("/api/duty-requests", {
        type: "WFH",
        fromDate: form.date,
        reason: form.reason.trim(),
        hours,
        address: form.address.trim() || undefined,
        contact: form.contact.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(`WFH request ${res.code} submitted`, { description: "Awaiting manager approval." });
      onOpenChange(false);
      reset();
      onCreated();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not submit the request.");
    },
  });

  function submit() {
    const errs: typeof errors = {};
    if (!form.date) errs.date = "Select a date.";
    if (form.reason.trim().length < 5) errs.reason = "Reason must be at least 5 characters.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BriefcaseBusiness className="h-4 w-4 text-primary" /> Request Work From Home
          </DialogTitle>
          <DialogDescription>Manager approval is required. Stay reachable during shift hours.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="wfh-date">Date</Label>
            <Input
              id="wfh-date" type="date" min={today} value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
            {errors.date ? <p className="text-xs text-danger">{errors.date}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label>Duration</Label>
            <RadioGroup
              value={form.duration}
              onValueChange={(v) => setForm((f) => ({ ...f, duration: v as "FULL" | "HALF" }))}
              className="grid grid-cols-2 gap-2"
            >
              {(["FULL", "HALF"] as const).map((d) => (
                <label
                  key={d}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors",
                    form.duration === d ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  <RadioGroupItem value={d} id={`wfh-dur-${d}`} className="h-3.5 w-3.5" />
                  <Clock className="h-3 w-3" />
                  {d === "FULL" ? "Full day · 8h" : "Half day · 4h"}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wfh-reason">Reason</Label>
            <Textarea
              id="wfh-reason" rows={3} placeholder="e.g. ISP installation at home, focus work day"
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

          <div className="space-y-1.5">
            <Label htmlFor="wfh-addr" className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Work Location Address
            </Label>
            <Input
              id="wfh-addr" placeholder="402, Silver Oak Residency, Adajan, Surat" value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wfh-contact" className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> Contact Number
            </Label>
            <Input
              id="wfh-contact" placeholder="+91 98765 43210" value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            />
          </div>

          <p className="rounded-lg bg-info-soft px-2.5 py-2 text-[11px] text-info">
            Approval flow: Manager review → confirmation. Web punching still applies on the WFH day.
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
  );
}
