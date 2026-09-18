"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader, SectionCard, StatusBadge, PriorityBadge, DataState, DataSkeleton, EmptyState,
} from "@/components/hrms/shared";
import { apiGet, apiPost } from "@/lib/hrms/client";
import { fmtDate, relativeTime } from "@/lib/hrms/time";
import { useHrmsStore } from "@/lib/hrms/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  LifeBuoy, Plus, MessagesSquare, Send, Clock, CircleCheck, Headset, UserRound,
  Timer, TimerReset, AlarmClockOff, Gauge,
} from "lucide-react";
import {
  slaState, slaCountdownLabel, slaResponseLabel, fmtDurationMs,
  SLA_TARGET_LABELS,
  type SlaState, type SlaSummary,
} from "@/lib/hrms/sla";
import { fmtTime12 } from "@/lib/hrms/time";

// ── types (API contract) ─────────────────────────────────────
interface TicketComment {
  by: string;
  at: string;
  text: string;
}

interface TicketItem {
  id: string;
  code: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assignee: string | null;
  comments: TicketComment[];
  createdAt: string;
  updatedAt: string;
  slaDueAt: string;
  firstResponseAt: string | null;
}

interface TicketsPayload {
  items: TicketItem[];
  summary?: SlaSummary;
}

// ── constants ────────────────────────────────────────────────
const CATEGORY_META: Record<string, { label: string; className: string }> = {
  HR: { label: "HR", className: "border-info/20 bg-info-soft text-info" },
  IT: { label: "IT", className: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  FACILITIES: { label: "Facilities", className: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  PAYROLL: { label: "Payroll", className: "border-success/20 bg-success-soft text-success" },
  ADMIN: { label: "Admin", className: "border-border bg-muted text-muted-foreground" },
  ATTENDANCE: { label: "Attendance", className: "border-primary/20 bg-primary/10 text-primary" },
};

const CREATE_CATEGORIES = [
  { value: "HR", label: "HR" },
  { value: "IT", label: "IT" },
  { value: "FACILITIES", label: "Facilities" },
  { value: "PAYROLL", label: "Payroll" },
  { value: "ADMIN", label: "Admin" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low", sla: "3 days" },
  { value: "NORMAL", label: "Normal", sla: "2 business days" },
  { value: "HIGH", label: "High", sla: "8 hours" },
  { value: "URGENT", label: "Urgent", sla: "4 hours" },
] as const;

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent",
};

const OPEN_STATUSES = ["OPEN", "IN_PROGRESS"];

/** Live clock — re-renders consumers every `intervalMs` (default 30s) for countdowns. */
function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const SLA_CHIP_STYLES: Record<SlaState["status"], { className: string; icon: typeof Timer }> = {
  ON_TRACK: { className: "border-border bg-muted/60 text-muted-foreground", icon: Timer },
  AT_RISK: { className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: TimerReset },
  BREACHED: { className: "border-danger/30 bg-danger-soft text-danger", icon: AlarmClockOff },
  MET: { className: "border-success/25 bg-success-soft text-success", icon: CircleCheck },
  MISSED: { className: "border-danger/25 bg-danger-soft/70 text-danger dark:text-red-400", icon: AlarmClockOff },
};

/** Compact live SLA chip for ticket cards. */
function SlaChip({ ticket: t, now }: { ticket: TicketItem; now: number }) {
  const state = slaState(
    { priority: t.priority, createdAt: t.createdAt, firstResponseAt: t.firstResponseAt },
    new Date(now),
  );
  const meta = SLA_CHIP_STYLES[state.status];
  const Icon = meta.icon;
  const label = state.remainingMs != null ? slaCountdownLabel(state) : slaResponseLabel(state);
  return (
    <span
      title={`First response target: ${SLA_TARGET_LABELS[t.priority] ?? SLA_TARGET_LABELS.NORMAL}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0 text-[11px] font-medium",
        meta.className,
        state.status === "AT_RISK" && "animate-pulse",
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="tabular whitespace-nowrap">{label}</span>
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.HR;
  return (
    <Badge variant="outline" className={cn("px-1.5 py-0 text-[11px] font-medium", meta.className)}>
      {meta.label}
    </Badge>
  );
}

// ── main view ────────────────────────────────────────────────
export default function HelpdeskView() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = useNow(30000);

  // auto-open create dialog when navigated with a form trigger (e.g. quick create)
  const openForm = useHrmsStore((s) => s.openForm);
  const setOpenForm = useHrmsStore((s) => s.setOpenForm);
  useEffect(() => {
    if (!openForm) return;
    // deferred so the dialog mount happens outside the effect body
    const t = setTimeout(() => {
      setCreateOpen(true);
      setOpenForm(null);
    }, 0);
    return () => clearTimeout(t);
  }, [openForm, setOpenForm]);

  const query = useQuery({ queryKey: ["hr-tickets"], queryFn: () => apiGet<TicketsPayload>("/api/hr-tickets") });
  const items = query.data?.items ?? [];
  const summary = query.data?.summary;
  const selected = selectedId ? items.find((t) => t.id === selectedId) ?? null : null;

  // Open tickets sorted by SLA urgency: breached → at-risk → on-track (soonest due first) → responded
  const urgencyRank = (t: TicketItem): number => {
    const s = slaState({ priority: t.priority, createdAt: t.createdAt, firstResponseAt: t.firstResponseAt }, new Date(now));
    if (s.status === "BREACHED") return 0;
    if (s.status === "AT_RISK") return 1;
    if (s.status === "ON_TRACK") return 2;
    return 3;
  };
  const openTickets = items
    .filter((t) => OPEN_STATUSES.includes(t.status))
    .sort((a, b) => urgencyRank(a) - urgencyRank(b) || a.slaDueAt.localeCompare(b.slaDueAt));

  return (
    <div className="space-y-4">
      <PageHeader
        title="HR Service Desk"
        subtitle="Raise requests and track HR support tickets"
        icon={<LifeBuoy className="h-4.5 w-4.5" />}
        actions={
          <Button size="sm" className="h-8 gap-1" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Raise Ticket
          </Button>
        }
      />

      <FaqCard />

      <DataState query={query} skeleton={<DataSkeleton />}>
        {() => (
          <>
            <SectionCard
              title={`Open Tickets (${openTickets.length})`}
              icon={<Headset className="h-3.5 w-3.5 text-primary" />}
              action={
                summary && (summary.breached > 0 || summary.atRisk > 0 || summary.metRatePct != null) ? (
                  <span className="flex flex-wrap items-center justify-end gap-1.5">
                    {summary.breached > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger-soft px-1.5 py-0 text-[11px] font-medium text-danger">
                        <AlarmClockOff className="h-3 w-3" /> {summary.breached} breached
                      </span>
                    ) : null}
                    {summary.atRisk > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <TimerReset className="h-3 w-3" /> {summary.atRisk} due soon
                      </span>
                    ) : null}
                    {summary.metRatePct != null ? (
                      <span className="text-[11px] text-muted-foreground">{summary.metRatePct}% responses in SLA</span>
                    ) : null}
                  </span>
                ) : undefined
              }
            >
              {openTickets.length === 0 ? (
                <EmptyState
                  title="No open tickets"
                  message="All clear. Raise a ticket if you need HR, IT, payroll or facilities help."
                  action={
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Raise Ticket
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {openTickets.map((t) => (
                    <TicketCard key={t.id} ticket={t} now={now} onClick={() => setSelectedId(t.id)} />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Ticket History" icon={<Clock className="h-3.5 w-3.5 text-primary" />}>
              {items.filter((t) => !OPEN_STATUSES.includes(t.status)).length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No resolved or closed tickets yet.</p>
              ) : (
                <div className="space-y-2">
                  {items
                    .filter((t) => !OPEN_STATUSES.includes(t.status))
                    .map((t) => (
                      <TicketCard key={t.id} ticket={t} now={now} onClick={() => setSelectedId(t.id)} />
                    ))}
                </div>
              )}
            </SectionCard>
          </>
        )}
      </DataState>

      {selected ? (
        <TicketDialog ticket={selected} now={now} onClose={() => setSelectedId(null)} />
      ) : null}

      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

// ── FAQ card ─────────────────────────────────────────────────
function FaqCard() {
  return (
    <SectionCard title="Quick Answers" icon={<CircleCheck className="h-3.5 w-3.5 text-primary" />}>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="faq-1" className="border-border">
          <AccordionTrigger className="py-2.5 text-left text-sm font-medium hover:no-underline">
            How do I regularize attendance?
          </AccordionTrigger>
          <AccordionContent className="text-xs leading-relaxed text-muted-foreground">
            Open <span className="font-medium text-foreground">Attendance → Regularize</span>, pick the day, and submit the
            correct punch-in/punch-out times with a reason. Your manager approves it and HR applies the correction.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="faq-2" className="border-border">
          <AccordionTrigger className="py-2.5 text-left text-sm font-medium hover:no-underline">
            When are payslips generated?
          </AccordionTrigger>
          <AccordionContent className="text-xs leading-relaxed text-muted-foreground">
            Payroll is processed in the last week of every month. Payslips appear under{" "}
            <span className="font-medium text-foreground">Payroll</span> on pay day and are archived in{" "}
            <span className="font-medium text-foreground">Documents</span> for download.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="faq-3" className="border-border">
          <AccordionTrigger className="py-2.5 text-left text-sm font-medium hover:no-underline">
            What are the response SLAs?
          </AccordionTrigger>
          <AccordionContent className="text-xs leading-relaxed text-muted-foreground">
            Every ticket carries a first-response SLA based on priority —{" "}
            <span className="font-medium text-foreground">Urgent 4 hours</span>,{" "}
            <span className="font-medium text-foreground">High 8 hours</span>,{" "}
            <span className="font-medium text-foreground">Normal 2 business days</span> and{" "}
            <span className="font-medium text-foreground">Low 3 days</span>. Open tickets show a live countdown; overdue
            tickets are flagged red and escalated to the assigned team.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="faq-4" className="border-b-0">
          <AccordionTrigger className="py-2.5 text-left text-sm font-medium hover:no-underline">
            How to claim expenses?
          </AccordionTrigger>
          <AccordionContent className="text-xs leading-relaxed text-muted-foreground">
            Create the claim under <span className="font-medium text-foreground">Expenses</span> with the receipt reference,
            submit it for approval, and track the Manager → Finance → Paid stages. Approved claims are reimbursed with the
            next payroll cycle.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SectionCard>
  );
}

// ── ticket card ──────────────────────────────────────────────
function TicketCard({ ticket: t, now, onClick }: { ticket: TicketItem; now: number; onClick: () => void }) {
  const sla = slaState({ priority: t.priority, createdAt: t.createdAt, firstResponseAt: t.firstResponseAt }, new Date(now));
  const open = OPEN_STATUSES.includes(t.status);
  const breached = open && sla.status === "BREACHED";
  const atRisk = open && sla.status === "AT_RISK";

  return (
    <button
      className={cn(
        "group w-full rounded-xl border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-px hover:shadow-md",
        breached
          ? "border-danger/40 hover:border-danger/60"
          : atRisk
            ? "border-amber-500/35 hover:border-amber-500/55"
            : "border-border hover:border-primary/40",
      )}
      onClick={onClick}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] font-medium text-muted-foreground">{t.code}</span>
        <CategoryBadge category={t.category} />
        <PriorityBadge priority={t.priority === "NORMAL" ? "NORMAL" : t.priority} label={PRIORITY_LABELS[t.priority] ?? t.priority} />
        <StatusBadge status={t.status} label={t.status === "IN_PROGRESS" ? "In Progress" : undefined} />
        <SlaChip ticket={t} now={now} />
      </div>
      <p className="mt-1.5 text-sm font-medium text-foreground">{t.subject}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {t.assignee ? <span>{t.assignee}</span> : null}
        <span>· raised {relativeTime(t.createdAt)}</span>
        <span>· updated {relativeTime(t.updatedAt)}</span>
        {t.comments.length > 0 ? (
          <span className="inline-flex items-center gap-1">
            · <MessagesSquare className="h-3 w-3" /> {t.comments.length}
          </span>
        ) : null}
      </div>
    </button>
  );
}

// ── SLA detail panel (dialog) ───────────────────────────────
function SlaPanel({ ticket: t, now }: { ticket: TicketItem; now: number }) {
  const sla = slaState({ priority: t.priority, createdAt: t.createdAt, firstResponseAt: t.firstResponseAt }, new Date(now));
  const targetMs = sla.targetHours * 3600000;
  const label = SLA_TARGET_LABELS[t.priority] ?? SLA_TARGET_LABELS.NORMAL;

  // pending: elapsed progress toward due (capped for display)
  if (sla.remainingMs != null) {
    const overdue = sla.remainingMs < 0;
    const elapsedMs = targetMs - sla.remainingMs;
    const pct = Math.min(100, Math.round((elapsedMs / targetMs) * 100));
    const barColor = overdue ? "bg-danger" : sla.status === "AT_RISK" ? "bg-amber-500" : "bg-primary";
    return (
      <div
        className={cn(
          "rounded-lg border p-3",
          overdue
            ? "border-danger/30 bg-danger-soft/50"
            : sla.status === "AT_RISK"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-border bg-muted/30",
        )}
        role="status"
        aria-label="First response SLA"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className={cn("flex items-center gap-1.5 text-xs font-semibold", overdue ? "text-danger" : sla.status === "AT_RISK" ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
            <Gauge className="h-3.5 w-3.5" /> First response SLA — {label} target
          </p>
          <p className={cn("tabular text-sm font-semibold", overdue ? "text-danger" : sla.status === "AT_RISK" ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
            {slaCountdownLabel(sla)}
          </p>
        </div>
        {/* progress track */}
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn("h-full rounded-full transition-all duration-500", barColor, sla.status === "AT_RISK" && "animate-pulse")}
            style={{ width: `${overdue ? 100 : pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {overdue ? (
            <>Response overdue — {t.assignee ?? "the support team"} has been notified. Escalate with a reply if it stays unattended.</>
          ) : (
            <>Due by {fmtDate(t.slaDueAt)} · {fmtTime12(t.slaDueAt)} — awaiting first response from {t.assignee ?? "the support team"}.</>
          )}
        </p>
      </div>
    );
  }

  // responded: response time vs target
  const respondedInH = (sla.respondedInMs ?? 0) / 3600000;
  const withinSla = sla.status === "MET";
  return (
    <div
      className={cn("rounded-lg border p-3", withinSla ? "border-success/25 bg-success-soft/40" : "border-danger/25 bg-danger-soft/40")}
      role="status"
      aria-label="First response SLA result"
    >
      <p className={cn("flex items-center gap-1.5 text-xs font-semibold", withinSla ? "text-success" : "text-danger")}>
        {withinSla ? <CircleCheck className="h-3.5 w-3.5" /> : <AlarmClockOff className="h-3.5 w-3.5" />}
        First response in {fmtSlaResponse(sla)} — {withinSla ? "within" : "outside"} the {label} SLA
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Target {label} · {respondedInH.toFixed(1)}h taken ({Math.round((respondedInH / sla.targetHours) * 100)}% of target).
      </p>
    </div>
  );
}

function fmtSlaResponse(sla: SlaState): string {
  return sla.respondedInMs != null ? fmtDurationMs(sla.respondedInMs) : "—";
}

// ── ticket detail dialog ─────────────────────────────────────
function TicketDialog({ ticket: t, now, onClose }: { ticket: TicketItem; now: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["hr-tickets"] });

  const commentMutation = useMutation({
    mutationFn: (body: string) => apiPost(`/api/hr-tickets/${t.id}`, { text: body }),
    onSuccess: () => {
      setText("");
      toast.success("Reply posted", { description: `${t.code} conversation updated.` });
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not post the reply."),
  });

  const closeMutation = useMutation({
    mutationFn: () => apiPost(`/api/hr-tickets/${t.id}`, { action: "close" }),
    onSuccess: () => {
      toast.success(`${t.code} closed`);
      setConfirmClose(false);
      invalidate();
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not close the ticket."),
  });

  function postComment(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    commentMutation.mutate(trimmed);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-medium text-muted-foreground">{t.code}</span>
            <CategoryBadge category={t.category} />
            <PriorityBadge priority={t.priority === "NORMAL" ? "NORMAL" : t.priority} label={PRIORITY_LABELS[t.priority] ?? t.priority} />
            <StatusBadge status={t.status} label={t.status === "IN_PROGRESS" ? "In Progress" : undefined} />
          </div>
          <DialogTitle className="text-base leading-snug">{t.subject}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 text-xs">
            {t.assignee ? <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" /> {t.assignee}</span> : null}
            <span>· raised {fmtDate(t.createdAt)}</span>
            <span>· updated {relativeTime(t.updatedAt)}</span>
          </DialogDescription>
        </DialogHeader>

        <SlaPanel ticket={t} now={now} />

        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
          {t.description}
        </p>

        <Separator />

        {/* conversation thread */}
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <MessagesSquare className="h-3.5 w-3.5 text-primary" /> Conversation
          </p>
          <div className="max-h-72 space-y-2.5 overflow-y-auto scroll-thin pr-1">
            {t.comments.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No updates yet — the assigned team will respond here.
              </p>
            ) : (
              t.comments.map((c, i) => {
                const mine = c.by === "You";
                return (
                  <div key={`${c.at}-${i}`} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg border px-2.5 py-2",
                        mine ? "border-primary/25 bg-primary/10" : "border-border bg-card"
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[11px] font-semibold text-foreground">{c.by}</span>
                        <span className="text-[10px] text-muted-foreground">{relativeTime(c.at)}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-foreground">{c.text}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* composer */}
        <form onSubmit={postComment} className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write an update…"
            className="h-9 text-sm"
            maxLength={1000}
          />
          <Button type="submit" size="sm" className="h-9 gap-1" disabled={!text.trim() || commentMutation.isPending}>
            <Send className="h-3.5 w-3.5" /> Post
          </Button>
        </form>

        <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            {t.status === "RESOLVED"
              ? "Resolved — close the ticket if you are satisfied."
              : `${PRIORITY_LABELS[t.priority] ?? t.priority} priority: first response within ${SLA_TARGET_LABELS[t.priority] ?? SLA_TARGET_LABELS.NORMAL}.`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close Window</Button>
            {t.status === "RESOLVED" ? (
              <Button variant="outline" className="text-success hover:text-success" onClick={() => setConfirmClose(true)}>
                <CircleCheck className="mr-1.5 h-3.5 w-3.5" /> Close Ticket
              </Button>
            ) : null}
          </div>
        </DialogFooter>

        {confirmClose ? (
          <AlertDialog open onOpenChange={(o) => { if (!o) setConfirmClose(false); }}>
            <AlertDialogContent className="sm:max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Close ticket {t.code}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The issue is marked resolved. Closing it archives the conversation and stops further updates.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Open</AlertDialogCancel>
                <AlertDialogAction className="bg-success text-white hover:bg-success/90" disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
                  Close Ticket
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ── create ticket dialog ─────────────────────────────────────
interface CreateErrors {
  category?: string;
  subject?: string;
  description?: string;
}

function CreateTicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("NORMAL");
  const [errors, setErrors] = useState<CreateErrors>({});

  function resetForm() {
    setCategory("");
    setSubject("");
    setDescription("");
    setPriority("NORMAL");
    setErrors({});
  }

  function validate(): boolean {
    const errs: CreateErrors = {};
    if (!category) errs.category = "Select a category.";
    if (subject.trim().length < 5) errs.subject = "Subject must be at least 5 characters.";
    if (description.trim().length < 10) errs.description = "Describe your issue in at least 10 characters.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const mutation = useMutation({
    mutationFn: (payload: { category: string; subject: string; description: string; priority: string }) =>
      apiPost<{ ticket: TicketItem }>("/api/hr-tickets", payload),
    onSuccess: (res) => {
      toast.success(`Ticket ${res.ticket.code} raised`, {
        description: `${res.ticket.assignee ?? "Support"} will respond within the SLA.`,
      });
      queryClient.invalidateQueries({ queryKey: ["hr-tickets"] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not raise the ticket. Please retry."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate({ category, subject: subject.trim(), description: description.trim(), priority });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Raise a Ticket</DialogTitle>
            <DialogDescription>
              Route your request to the right team — each priority carries a first-response SLA, tracked live on your ticket.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => { setCategory(v); setErrors((er) => ({ ...er, category: undefined })); }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {CREATE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category ? <p className="text-[11px] text-danger">{errors.category}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <Input
                placeholder="Short summary of your issue"
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setErrors((er) => ({ ...er, subject: undefined })); }}
                className="h-9"
                maxLength={120}
              />
              {errors.subject ? <p className="text-[11px] text-danger">{errors.subject}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                rows={4}
                placeholder="Explain the issue, when it started, and what you have already tried…"
                value={description}
                onChange={(e) => { setDescription(e.target.value); setErrors((er) => ({ ...er, description: undefined })); }}
                maxLength={2000}
              />
              {errors.description ? <p className="text-[11px] text-danger">{errors.description}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <RadioGroup value={priority} onValueChange={setPriority} className="grid grid-cols-2 gap-2">
                {PRIORITY_OPTIONS.map((p) => (
                  <label
                    key={p.value}
                    className={cn(
                      "flex cursor-pointer flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors",
                      priority === p.value
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <RadioGroupItem value={p.value} className="h-3.5 w-3.5" />
                      {p.label}
                    </span>
                    <span className={cn("pl-6 text-[10px] font-normal", priority === p.value ? "text-primary/80" : "text-muted-foreground/80")}>
                      ~{p.sla} response
                    </span>
                  </label>
                ))}
              </RadioGroup>
              <p className="text-[11px] text-muted-foreground">
                The first-response SLA is measured from submission. {SLA_TARGET_LABELS[priority] ?? SLA_TARGET_LABELS.NORMAL} for the selected priority.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Raising…" : "Raise Ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
