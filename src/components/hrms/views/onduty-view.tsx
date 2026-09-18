"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet, apiPost, ApiError } from "@/lib/hrms/client";
import { fmtDateShort, dayIST } from "@/lib/hrms/time";
import { PageHeader, SectionCard, StatusBadge, EmptyState, DataState } from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { PlaneTakeoff, Loader2, XCircle, Building2, MapPin, GraduationCap, Mic, Car, RadioTower, Briefcase, Phone } from "lucide-react";

// ── types & constants ───────────────────────────────────────
interface DutyItem {
  id: string; code: string; type: string; subtype: string | null;
  fromDate: string; toDate: string | null; hours: number | null; reason: string;
  destination: string | null; clientName: string | null; contact: string | null; address: string | null;
  status: string; appliedAt: string; decidedAt: string | null; decisionNote: string | null;
}

const SUBTYPES: { value: string; label: string; desc: string; icon: typeof Building2 }[] = [
  { value: "CLIENT_VISIT", label: "Client Visit", desc: "Meet a customer at their office or site", icon: Building2 },
  { value: "FIELD_VISIT", label: "Field Visit", desc: "Field work, inspections or surveys", icon: MapPin },
  { value: "TRAINING", label: "Training", desc: "Attend a course or workshop", icon: GraduationCap },
  { value: "CONFERENCE", label: "Conference", desc: "Industry or company events", icon: Mic },
  { value: "TRAVEL", label: "Official Travel", desc: "Business travel between locations", icon: Car },
  { value: "REMOTE_SITE", label: "Remote Site", desc: "Work from a project or plant site", icon: RadioTower },
];

const SUBTYPE_LABELS: Record<string, string> = Object.fromEntries(SUBTYPES.map((s) => [s.value, s.label]));

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── main view ───────────────────────────────────────────────
export default function OnDutyView() {
  const openForm = useHrmsStore((s) => s.openForm);
  const setOpenForm = useHrmsStore((s) => s.setOpenForm);
  const queryClient = useQueryClient();

  const [applyOpen, setApplyOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DutyItem | null>(null);

  const listQuery = useQuery({
    queryKey: ["duty", "onduty"],
    queryFn: () => apiGet<{ requests: DutyItem[] }>("/api/duty-requests?type=ON_DUTY"),
  });

  // auto-open create dialog when navigated with a form trigger (quick create / desk CTA)
  useEffect(() => {
    if (openForm !== "apply" && openForm !== "onduty") return;
    // deferred so the dialog mount happens outside the effect body
    const t = setTimeout(() => {
      setApplyOpen(true);
      setOpenForm(null);
    }, 0);
    return () => clearTimeout(t);
  }, [openForm, setOpenForm]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["duty", "onduty"] });
    void queryClient.invalidateQueries({ queryKey: ["desk"] });
  };

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ code: string }>("/api/duty-requests", { action: "cancel", id }),
    onSuccess: (res) => {
      toast.success(`On-duty request ${res.code} withdrawn`);
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
        title="On Duty / Business Visit"
        subtitle="Client visits, field work, training and official travel"
        icon={<PlaneTakeoff className="h-4.5 w-4.5" />}
        actions={
          <Button size="sm" onClick={() => setApplyOpen(true)}>
            <Briefcase className="mr-1.5 h-3.5 w-3.5" /> New On-Duty Request
          </Button>
        }
      />

      <SectionCard title="Visit Types" contentClassName="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {SUBTYPES.map((s) => (
            <div key={s.value} className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">{s.label}</p>
                <p className="text-[11px] text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Approved on-duty days are marked OD in attendance — travel time within the visit counts as working hours.
        </p>
      </SectionCard>

      <SectionCard title="My On-Duty Requests" contentClassName="pt-0">
        <DataState query={listQuery} errorTitle="Unable to load on-duty requests">
          {({ requests }) =>
            requests.length === 0 ? (
              <EmptyState
                title="No on-duty requests"
                message="Raise a request for client visits, field work, training or official travel."
                action={<Button size="sm" variant="outline" onClick={() => setApplyOpen(true)}>New Request</Button>}
              />
            ) : (
              <>
                {/* desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Destination / Client</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Decision</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs font-semibold">{r.code}</TableCell>
                          <TableCell className="text-xs">
                            <span className="inline-flex items-center gap-1.5">
                              <Briefcase className="h-3 w-3 text-muted-foreground" />
                              {SUBTYPE_LABELS[r.subtype ?? ""] ?? "On Duty"}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {fmtDateShort(r.fromDate)}{r.toDate && r.toDate !== r.fromDate ? ` → ${fmtDateShort(r.toDate)}` : ""}
                          </TableCell>
                          <TableCell className="text-xs tabular">{r.hours ? `${r.hours}h` : "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {r.clientName ?? r.destination ?? "—"}
                          </TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                          <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={r.decisionNote ?? undefined}>
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
                        <p className="text-xs font-semibold">{r.code} · {SUBTYPE_LABELS[r.subtype ?? ""] ?? "On Duty"}</p>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {fmtDateShort(r.fromDate)}{r.toDate && r.toDate !== r.fromDate ? ` → ${fmtDateShort(r.toDate)}` : ""}
                        {r.hours ? ` · ${r.hours}h` : ""}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {r.destination ?? ""}{r.clientName ? `${r.destination ? " · " : ""}${r.clientName}` : ""}
                        {r.destination || r.clientName ? " — " : ""}{r.reason}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        {r.decisionNote ? <span className="truncate text-[11px] italic text-muted-foreground">“{r.decisionNote}”</span> : <span />}
                        {r.status === "PENDING" ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-danger" onClick={() => setCancelTarget(r)}>
                            <XCircle className="mr-1 h-3 w-3" /> Cancel
                          </Button>
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

      <OnDutyDialog open={applyOpen} onOpenChange={setApplyOpen} onCreated={invalidate} />

      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => { if (!v) setCancelTarget(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw on-duty request?</AlertDialogTitle>
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
function OnDutyDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const today = isoDay(dayIST(new Date()));
  const [form, setForm] = useState({
    subtype: "", fromDate: "", toDate: "", hours: "8", reason: "",
    destination: "", clientName: "", notes: "", contact: "",
  });
  const [errors, setErrors] = useState<{ subtype?: string; date?: string; reason?: string; hours?: string }>({});

  function reset() {
    setForm({ subtype: "", fromDate: "", toDate: "", hours: "8", reason: "", destination: "", clientName: "", notes: "", contact: "" });
    setErrors({});
  }

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ code: string }>("/api/duty-requests", {
        type: "ON_DUTY",
        subtype: form.subtype,
        fromDate: form.fromDate,
        toDate: form.toDate || undefined,
        hours: form.hours ? Number(form.hours) : undefined,
        reason: form.reason.trim(),
        destination: form.destination.trim() || undefined,
        clientName: form.clientName.trim() || undefined,
        address: form.notes.trim() || undefined,
        contact: form.contact.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(`On-duty request ${res.code} submitted`, { description: "Awaiting manager approval." });
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
    if (!form.subtype) errs.subtype = "Select a visit type.";
    if (!form.fromDate) errs.date = "Select a date.";
    else if (form.toDate && form.toDate < form.fromDate) errs.date = "End date cannot be before start date.";
    const h = Number(form.hours);
    if (form.hours && (Number.isNaN(h) || h < 1 || h > 12)) errs.hours = "Hours must be between 1 and 12.";
    if (form.reason.trim().length < 5) errs.reason = "Purpose must be at least 5 characters.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scroll-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlaneTakeoff className="h-4 w-4 text-primary" /> On-Duty / Business Visit
          </DialogTitle>
          <DialogDescription>For client visits, field work, training, conferences and official travel.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Visit Type</Label>
            <Select value={form.subtype} onValueChange={(v) => setForm((f) => ({ ...f, subtype: v }))}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select visit type" />
              </SelectTrigger>
              <SelectContent>
                {SUBTYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="flex items-center gap-2">
                      <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {s.label}
                      <span className="text-[10px] text-muted-foreground">{s.desc}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.subtype ? <p className="text-xs text-danger">{errors.subtype}</p> : null}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="od-from">Date</Label>
              <Input
                id="od-from" type="date" min={today} value={form.fromDate}
                onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od-to">End <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="od-to" type="date" min={form.fromDate || today} value={form.toDate}
                onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od-hours">Hours</Label>
              <Input
                id="od-hours" type="number" min={1} max={12} placeholder="8" value={form.hours}
                onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
              />
            </div>
          </div>
          {errors.date ? <p className="text-xs text-danger">{errors.date}</p> : null}
          {errors.hours ? <p className="text-xs text-danger">{errors.hours}</p> : null}

          <div className="space-y-1.5">
            <Label htmlFor="od-reason">Purpose</Label>
            <Textarea
              id="od-reason" rows={2} placeholder="e.g. Deployment support at client production environment"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              onBlur={() => {
                if (form.reason.trim().length > 0 && form.reason.trim().length < 5) {
                  setErrors((er) => ({ ...er, reason: "Purpose must be at least 5 characters." }));
                } else {
                  setErrors((er) => ({ ...er, reason: undefined }));
                }
              }}
            />
            {errors.reason ? <p className="text-xs text-danger">{errors.reason}</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="od-dest" className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Destination
              </Label>
              <Input
                id="od-dest" placeholder="Acme Corp, Mumbai" value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od-client" className="flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Client Name
              </Label>
              <Input
                id="od-client" placeholder="Acme Corp" value={form.clientName}
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="od-notes">Notes / Address</Label>
              <Input
                id="od-notes" placeholder="Visit agenda, site address, POC details" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od-contact" className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> Contact
              </Label>
              <Input
                id="od-contact" placeholder="+91 98765 43210" value={form.contact}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              />
            </div>
          </div>

          <p className="rounded-lg bg-info-soft px-2.5 py-2 text-[11px] text-info">
            Approval flow: Manager review → confirmation. Approved days are marked OD in attendance.
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
