"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "@/lib/hrms/client";
import {
  PageHeader, DataState, EmptyState, Initials, StatusBadge,
} from "@/components/hrms/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CheckCheck, ClipboardCheck, ThumbsUp, ThumbsDown, Loader2, UserX, Banknote,
  CalendarRange, Clock3, ArrowRight, MapPin, FileText,
} from "lucide-react";
import { useHrmsStore } from "@/lib/hrms/store";
import { fmtDate, fmtDateShort, fmtDuration, fmtINR, fmtTime } from "@/lib/hrms/time";

type DecidableKind = "leave" | "duty" | "attendance" | "timesheet" | "expense";
type DecidableAction = "approve" | "reject" | "pay";
type TabKey = DecidableKind;

interface EmployeeBrief { id: string; empCode: string; name: string; designation: string }

interface LeaveItem {
  id: string; code: string; employee: EmployeeBrief;
  leaveType: string; leaveTypeCode: string; leaveTypeColor: string;
  fromDate: string; toDate: string; dayMode: string; days: number;
  reason: string; contactDuringLeave: string | null; substituteName: string | null;
  appliedAt: string; stage: "MANAGER" | "HR";
}

interface DutyItem {
  id: string; code: string; employee: EmployeeBrief;
  type: string; subtype: string | null; fromDate: string; toDate: string | null;
  hours: number | null; reason: string; destination: string | null;
  clientName: string | null; address: string | null; appliedAt: string;
}

interface AttendanceItem {
  id: string; code: string; employee: EmployeeBrief; date: string;
  currentCheckIn: string | null; currentCheckOut: string | null;
  requestedCheckIn: string | null; requestedCheckOut: string | null;
  reason: string; appliedAt: string;
}

interface TimesheetGroup {
  weekStart: string; employee: EmployeeBrief;
  entries: { id: string; date: string; project: string; taskName: string | null; description: string | null; minutes: number; billable: boolean }[];
  totalMinutes: number; billableMinutes: number;
}

interface ExpenseItem {
  id: string; code: string; employee: EmployeeBrief; category: string;
  expenseDate: string; amount: number; currency: string; merchant: string | null;
  project: string | null; description: string | null; status: string;
  submittedAt: string | null; stage: "MANAGER" | "FINANCE" | "PAY";
}

interface ApprovalsCounts { leave: number; duty: number; attendance: number; timesheet: number; expense: number; total: number }

interface ApprovalsResponse {
  tab: string;
  counts: ApprovalsCounts;
  items: unknown[];
}

const TAB_LABELS: Record<TabKey, string> = {
  leave: "Leave",
  duty: "WFH & OD",
  attendance: "Attendance",
  timesheet: "Timesheets",
  expense: "Expenses",
};

const KIND_LABELS: Record<DecidableKind, string> = {
  leave: "leave request",
  duty: "duty request",
  attendance: "regularization",
  timesheet: "timesheet",
  expense: "expense",
};

const CATEGORY_LABELS: Record<string, string> = {
  TRAVEL: "Travel", FOOD: "Food", HOTEL: "Hotel", FUEL: "Fuel",
  CLIENT: "Client", SUPPLIES: "Supplies", OTHER: "Other",
};

const DAY_MODE_LABELS: Record<string, string> = {
  FULL: "Full day", FIRST_HALF: "First half", SECOND_HALF: "Second half",
};

interface DecisionDraft {
  kind: DecidableKind;
  action: DecidableAction;
  ids: string[];
  employeeName: string;
  code: string;
}

function ActionButtons({ onApprove, onReject, onPay, disabled, payOnly }: {
  onApprove: () => void;
  onReject?: () => void;
  onPay?: () => void;
  disabled?: boolean;
  payOnly?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
      {payOnly ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-success/40 text-xs text-success hover:bg-success-soft"
          onClick={onPay}
          disabled={disabled}
        >
          <Banknote className="h-3.5 w-3.5" /> Mark paid
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-success/40 text-xs text-success hover:bg-success-soft"
          onClick={onApprove}
          disabled={disabled}
        >
          <ThumbsUp className="h-3.5 w-3.5" /> Approve
        </Button>
      )}
      {onReject ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-danger/40 text-xs text-danger hover:bg-danger-soft"
          onClick={onReject}
          disabled={disabled}
        >
          <ThumbsDown className="h-3.5 w-3.5" /> Reject
        </Button>
      ) : null}
    </div>
  );
}

export default function ApprovalsView() {
  const employee = useHrmsStore((s) => s.employee);
  const timeFormat = useHrmsStore((s) => s.timeFormat);
  const queryClient = useQueryClient();
  const isManager = employee?.role === "MANAGER" || employee?.role === "HR" || employee?.role === "ADMIN";

  const [tab, setTab] = useState<TabKey>("leave");
  const [draft, setDraft] = useState<DecisionDraft | null>(null);
  const [comment, setComment] = useState("");

  const approvalsQuery = useQuery({
    queryKey: ["approvals", tab],
    queryFn: () => apiGet<ApprovalsResponse>(`/api/approvals?tab=${tab}`),
    enabled: isManager,
  });

  const decideMutation = useMutation({
    mutationFn: (vars: { kind: DecidableKind; ids: string[]; action: DecidableAction; comment?: string }) =>
      apiPost<{ processed: number }>("/api/approvals/decide", {
        kind: vars.kind,
        ids: vars.ids,
        action: vars.action,
        ...(vars.comment ? { comment: vars.comment } : {}),
      }),
    onSuccess: (res, vars) => {
      const verb = vars.action === "approve" ? "approved" : vars.action === "pay" ? "marked paid" : "rejected";
      toast.success(`${res.processed} item${res.processed === 1 ? "" : "s"} ${verb}`);
      setDraft(null);
      setComment("");
      void queryClient.invalidateQueries({ queryKey: ["approvals"] });
      void queryClient.invalidateQueries({ queryKey: ["desk"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Decision could not be recorded");
    },
  });

  const counts = approvalsQuery.data?.counts;

  const items = useMemo(() => approvalsQuery.data?.items ?? [], [approvalsQuery.data]);

  function openDecision(kind: DecidableKind, action: DecidableAction, ids: string[], employeeName: string, code: string) {
    setComment("");
    setDraft({ kind, action, ids, employeeName, code });
  }

  function confirmDecision() {
    if (!draft) return;
    decideMutation.mutate({ kind: draft.kind, ids: draft.ids, action: draft.action, comment: comment.trim() || undefined });
  }

  if (!isManager) {
    return (
      <div className="space-y-4">
        <PageHeader title="Approvals" subtitle="Pending requests from your team" icon={<ClipboardCheck className="h-4.5 w-4.5" />} />
        <EmptyState
          title="Approvals requires a manager role"
          message="Only managers, HR and admins can review team requests."
          icon={<UserX className="h-5 w-5" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        subtitle="Pending requests from your team"
        icon={<ClipboardCheck className="h-4.5 w-4.5" />}
        actions={
          counts ? (
            <Badge variant="outline" className="h-7 gap-1.5 bg-warning-soft px-2.5 text-xs text-[#B54708]">
              <Clock3 className="h-3.5 w-3.5" />
              {counts.total} pending
            </Badge>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <div className="w-full overflow-x-auto pb-1">
          <TabsList className="h-9 w-max">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
              <TabsTrigger key={key} value={key} className="gap-1.5 text-xs">
                {TAB_LABELS[key]}
                {counts ? (
                  <Badge
                    variant="secondary"
                    className={`ml-0.5 h-4 min-w-4 px-1 text-[10px] tabular ${counts[key] > 0 ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                  >
                    {counts[key]}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <DataState query={approvalsQuery}>
        {() => (
          <div className="max-h-[62vh] space-y-3 overflow-y-auto scroll-thin pr-1">
            {items.length === 0 ? (
              <EmptyState
                title="No pending approvals. Inbox zero!"
                message={`All ${TAB_LABELS[tab].toLowerCase()} requests from your team are handled.`}
                icon={<CheckCheck className="h-5 w-5" />}
              />
            ) : (
              items.map((item, index) => {
                const busy = decideMutation.isPending;
                if (tab === "leave") {
                  const l = item as LeaveItem;
                  return (
                    <LeaveRow
                      key={l.id}
                      item={l}
                      disabled={busy}
                      onApprove={() => openDecision("leave", "approve", [l.id], l.employee.name, l.code)}
                      onReject={() => openDecision("leave", "reject", [l.id], l.employee.name, l.code)}
                    />
                  );
                }
                if (tab === "duty") {
                  const d = item as DutyItem;
                  return (
                    <DutyRow
                      key={d.id}
                      item={d}
                      disabled={busy}
                      onApprove={() => openDecision("duty", "approve", [d.id], d.employee.name, d.code)}
                      onReject={() => openDecision("duty", "reject", [d.id], d.employee.name, d.code)}
                    />
                  );
                }
                if (tab === "attendance") {
                  const a = item as AttendanceItem;
                  return (
                    <AttendanceRow
                      key={a.id}
                      item={a}
                      timeFormat={timeFormat}
                      disabled={busy}
                      onApprove={() => openDecision("attendance", "approve", [a.id], a.employee.name, a.code)}
                      onReject={() => openDecision("attendance", "reject", [a.id], a.employee.name, a.code)}
                    />
                  );
                }
                if (tab === "timesheet") {
                  const g = item as TimesheetGroup;
                  return (
                    <TimesheetRow
                      key={`${g.weekStart}-${g.employee.id}-${index}`}
                      item={g}
                      disabled={busy}
                      onApprove={() => openDecision("timesheet", "approve", g.entries.map((e) => e.id), g.employee.name, `week of ${fmtDateShort(g.weekStart)}`)}
                      onReject={() => openDecision("timesheet", "reject", g.entries.map((e) => e.id), g.employee.name, `week of ${fmtDateShort(g.weekStart)}`)}
                    />
                  );
                }
                const x = item as ExpenseItem;
                return (
                  <ExpenseRow
                    key={x.id}
                    item={x}
                    disabled={busy}
                    onApprove={() => openDecision("expense", "approve", [x.id], x.employee.name, x.code)}
                    onReject={x.stage !== "PAY" ? () => openDecision("expense", "reject", [x.id], x.employee.name, x.code) : undefined}
                    onPay={() => openDecision("expense", "pay", [x.id], x.employee.name, x.code)}
                  />
                );
              })
            )}
          </div>
        )}
      </DataState>

      {/* decision dialog */}
      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open && !decideMutation.isPending) setDraft(null); }}>
        <DialogContent className="sm:max-w-md">
          {draft ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {draft.action === "approve" ? "Approve" : draft.action === "pay" ? "Mark as paid" : "Reject"}{" "}
                  {KIND_LABELS[draft.kind]}?
                </DialogTitle>
                <DialogDescription>
                  {draft.employeeName} · {draft.code}
                  {draft.action === "approve" && draft.kind === "leave" && draft.ids.length === 1
                    ? " — approving forwards the request to HR for final confirmation."
                    : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional comment for the requester…"
                  className="min-h-20 text-sm"
                  maxLength={500}
                />
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setDraft(null)}
                  disabled={decideMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  variant={draft.action === "reject" ? "destructive" : "default"}
                  onClick={confirmDecision}
                  disabled={decideMutation.isPending}
                >
                  {decideMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…
                    </>
                  ) : draft.action === "reject" ? (
                    <>
                      <ThumbsDown className="h-3.5 w-3.5" /> Confirm reject
                    </>
                  ) : draft.action === "pay" ? (
                    <>
                      <Banknote className="h-3.5 w-3.5" /> Confirm payment
                    </>
                  ) : (
                    <>
                      <ThumbsUp className="h-3.5 w-3.5" /> Confirm approval
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── row renderers ───────────────────────────────────────────

function RowShell({ employee, code, topBadge, children, actions }: {
  employee: EmployeeBrief;
  code: string;
  topBadge?: React.ReactNode;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  const [firstName, ...rest] = employee.name.split(" ");
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <Initials first={firstName} last={rest.join(" ") || " "} size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-foreground">{employee.name}</p>
              <span className="font-mono text-[10px] text-muted-foreground">{code}</span>
              {topBadge}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{employee.designation}</p>
          </div>
        </div>
        {actions}
      </div>
      <div className="mt-3 border-t border-border pt-2.5">{children}</div>
    </div>
  );
}

function LeaveRow({ item, disabled, onApprove, onReject }: {
  item: LeaveItem;
  disabled?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <RowShell
      employee={item.employee}
      code={item.code}
      topBadge={
        item.stage === "HR" ? (
          <Badge variant="outline" className="bg-info-soft text-[10px] text-info">HR review</Badge>
        ) : null
      }
      actions={<ActionButtons onApprove={onApprove} onReject={onReject} disabled={disabled} />}
    >
      <div className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{fmtDateShort(item.fromDate)}</span>
          {item.toDate !== item.fromDate ? (
            <>
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium text-foreground">{fmtDateShort(item.toDate)}</span>
            </>
          ) : null}
          <span>· {item.days} day{item.days === 1 ? "" : "s"}</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Badge
            variant="outline"
            className="px-1.5 py-0 text-[10px]"
            style={{ color: item.leaveTypeColor, borderColor: `${item.leaveTypeColor}55` }}
          >
            {item.leaveType}
          </Badge>
          <span>{DAY_MODE_LABELS[item.dayMode] ?? item.dayMode}</span>
        </span>
        <span className="flex items-start gap-1.5 text-muted-foreground sm:col-span-2">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground">{item.reason}</span>
        </span>
        {item.contactDuringLeave || item.substituteName ? (
          <span className="text-[11px] text-muted-foreground sm:col-span-2">
            {item.contactDuringLeave ? `Contact: ${item.contactDuringLeave}` : ""}
            {item.contactDuringLeave && item.substituteName ? " · " : ""}
            {item.substituteName ? `Substitute: ${item.substituteName}` : ""}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">Applied {fmtDate(item.appliedAt)}</p>
    </RowShell>
  );
}

function DutyRow({ item, disabled, onApprove, onReject }: {
  item: DutyItem;
  disabled?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <RowShell
      employee={item.employee}
      code={item.code}
      topBadge={<StatusBadge status={item.type} label={item.type === "WFH" ? "WFH" : "On Duty"} />}
      actions={<ActionButtons onApprove={onApprove} onReject={onReject} disabled={disabled} />}
    >
      <div className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{fmtDateShort(item.fromDate)}</span>
          {item.toDate && item.toDate !== item.fromDate ? (
            <>
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium text-foreground">{fmtDateShort(item.toDate)}</span>
            </>
          ) : null}
          {item.hours ? <span>· {item.hours}h</span> : null}
        </span>
        {item.subtype ? (
          <span className="text-muted-foreground">
            Type <span className="font-medium text-foreground">{item.subtype.replace(/_/g, " ")}</span>
          </span>
        ) : null}
        <span className="flex items-start gap-1.5 text-muted-foreground sm:col-span-2">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground">{item.reason}</span>
        </span>
        {item.destination || item.clientName || item.address ? (
          <span className="flex items-start gap-1.5 text-[11px] text-muted-foreground sm:col-span-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {[item.destination, item.clientName, item.address].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">Applied {fmtDate(item.appliedAt)}</p>
    </RowShell>
  );
}

function PunchLine({ label, from, to, timeFormat }: {
  label: string;
  from: string | null;
  to: string | null;
  timeFormat: "12h" | "24h";
}) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium tabular text-foreground">{fmtTime(from, timeFormat)}</span>
      <ArrowRight className="h-3 w-3" />
      <span className="font-medium tabular text-primary">{fmtTime(to, timeFormat)}</span>
    </span>
  );
}

function AttendanceRow({ item, timeFormat, disabled, onApprove, onReject }: {
  item: AttendanceItem;
  timeFormat: "12h" | "24h";
  disabled?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <RowShell
      employee={item.employee}
      code={item.code}
      actions={<ActionButtons onApprove={onApprove} onReject={onReject} disabled={disabled} />}
    >
      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{fmtDate(item.date)}</span>
        </span>
        <PunchLine label="Current" from={item.currentCheckIn} to={item.currentCheckOut} timeFormat={timeFormat} />
        <PunchLine label="Requested" from={item.requestedCheckIn} to={item.requestedCheckOut} timeFormat={timeFormat} />
        <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground">{item.reason}</span>
        </span>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">Applied {fmtDate(item.appliedAt)}</p>
    </RowShell>
  );
}

function TimesheetRow({ item, disabled, onApprove, onReject }: {
  item: TimesheetGroup;
  disabled?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <RowShell
      employee={item.employee}
      code={`Week of ${fmtDateShort(item.weekStart)}`}
      actions={<ActionButtons onApprove={onApprove} onReject={onReject} disabled={disabled} />}
    >
      <div className="space-y-1">
        {item.entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span
                aria-label={e.billable ? "Billable" : "Non-billable"}
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.billable ? "bg-success" : "bg-muted-foreground/40"}`}
              />
              <span className="truncate font-medium text-foreground">{e.project}</span>
              {e.taskName ? <span className="truncate">· {e.taskName}</span> : null}
              <span className="shrink-0 text-[10px]">{fmtDateShort(e.date)}</span>
            </span>
            <span className="shrink-0 tabular font-medium text-foreground">{fmtDuration(e.minutes)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span>
          Total <span className="font-semibold tabular text-foreground">{fmtDuration(item.totalMinutes)}</span>
        </span>
        <span>
          Billable <span className="font-semibold tabular text-success">{fmtDuration(item.billableMinutes)}</span>
        </span>
        <span>{item.entries.length} entries</span>
      </div>
    </RowShell>
  );
}

function ExpenseRow({ item, disabled, onApprove, onReject, onPay }: {
  item: ExpenseItem;
  disabled?: boolean;
  onApprove: () => void;
  onReject?: () => void;
  onPay: () => void;
}) {
  const stageBadge =
    item.stage === "FINANCE" ? (
      <Badge variant="outline" className="bg-info-soft text-[10px] text-info">Awaiting finance</Badge>
    ) : item.stage === "PAY" ? (
      <Badge variant="outline" className="bg-warning-soft text-[10px] text-[#B54708]">Awaiting payment</Badge>
    ) : null;

  return (
    <RowShell
      employee={item.employee}
      code={item.code}
      topBadge={stageBadge}
      actions={
        <ActionButtons
          onApprove={onApprove}
          onReject={onReject}
          onPay={onPay}
          disabled={disabled}
          payOnly={item.stage === "PAY"}
        />
      }
    >
      <div className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Banknote className="h-3.5 w-3.5" />
          <span className="text-sm font-semibold tabular text-foreground">{fmtINR(item.amount)}</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {CATEGORY_LABELS[item.category] ?? item.category}
          </Badge>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{fmtDateShort(item.expenseDate)}</span>
          {item.merchant ? <span>· {item.merchant}</span> : null}
        </span>
        {item.project ? (
          <span className="text-[11px] text-muted-foreground">Project: <span className="text-foreground">{item.project}</span></span>
        ) : null}
        {item.description ? (
          <span className="flex items-start gap-1.5 text-[11px] text-muted-foreground sm:col-span-2">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="text-foreground">{item.description}</span>
          </span>
        ) : null}
      </div>
      {item.submittedAt ? (
        <p className="mt-1.5 text-[10px] text-muted-foreground">Submitted {fmtDate(item.submittedAt)}</p>
      ) : null}
    </RowShell>
  );
}
