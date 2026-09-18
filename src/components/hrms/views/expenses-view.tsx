"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader, SectionCard, StatusBadge, StatCard, DataState, DataSkeleton, EmptyState,
} from "@/components/hrms/shared";
import { apiPost, apiGet } from "@/lib/hrms/client";
import { dayIST, fmtDateShort, fmtINR, relativeTime } from "@/lib/hrms/time";
import { useHrmsStore } from "@/lib/hrms/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Receipt, Plus, Plane, Utensils, BedDouble, Fuel, Briefcase, Package, Circle,
  Paperclip, Check, Ban, Clock, CircleCheck, Pencil, Send, Undo2, X, FileCheck2,
} from "lucide-react";

// ── types (API contract) ─────────────────────────────────────
interface ExpenseItem {
  id: string;
  code: string;
  category: string;
  expenseDate: string;
  amount: number;
  merchant: string | null;
  project: string | null;
  description: string | null;
  receiptName: string | null;
  status: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface ExpensesPayload {
  items: ExpenseItem[];
  totals: { claimed: number; pending: number; approved: number; reimbursed: number };
}

interface ExpensePayload {
  category: string;
  expenseDate: string;
  amount: number;
  merchant?: string;
  project?: string;
  description?: string;
  receiptName?: string;
  action?: "update";
  id?: string;
}

interface FormErrors {
  category?: string;
  date?: string;
  amount?: string;
}

// ── constants ────────────────────────────────────────────────
const CATEGORY_META: Record<string, { label: string; icon: LucideIcon }> = {
  TRAVEL: { label: "Travel", icon: Plane },
  FOOD: { label: "Food", icon: Utensils },
  HOTEL: { label: "Hotel", icon: BedDouble },
  FUEL: { label: "Fuel", icon: Fuel },
  CLIENT: { label: "Client", icon: Briefcase },
  SUPPLIES: { label: "Supplies", icon: Package },
  OTHER: { label: "Other", icon: Circle },
};

const TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "reimbursed", label: "Reimbursed" },
] as const;

const TIMELINE_STEPS = [
  { key: "DRAFT", label: "Draft" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "MANAGER_APPROVED", label: "Manager" },
  { key: "FINANCE_APPROVED", label: "Finance" },
  { key: "PAID", label: "Paid" },
];

const CLAIMED_STATUSES = ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED", "PAID"];
const PENDING_STATUSES = ["SUBMITTED", "MANAGER_APPROVED"];

function statusLabel(s: string): string | undefined {
  switch (s) {
    case "DRAFT": return "Draft";
    case "SUBMITTED": return "Submitted";
    case "MANAGER_APPROVED": return "Manager Approved";
    case "FINANCE_APPROVED": return "Finance Approved";
    case "PAID": return "Reimbursed";
    case "REJECTED": return "Rejected";
    case "CANCELLED": return "Withdrawn";
    default: return undefined;
  }
}

function inTab(e: ExpenseItem, tab: string): boolean {
  switch (tab) {
    case "draft": return e.status === "DRAFT";
    case "submitted": return e.status === "SUBMITTED";
    case "approved": return e.status === "MANAGER_APPROVED";
    case "rejected": return e.status === "REJECTED";
    case "reimbursed": return e.status === "FINANCE_APPROVED" || e.status === "PAID";
    default: return true;
  }
}

function isThisMonthIST(iso: string): boolean {
  const day = dayIST(new Date(iso));
  const now = dayIST(new Date());
  return day.getUTCFullYear() === now.getUTCFullYear() && day.getUTCMonth() === now.getUTCMonth();
}

// ── main view ────────────────────────────────────────────────
export default function ExpensesView() {
  const [tab, setTab] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [confirm, setConfirm] = useState<{ type: "submit" | "withdraw"; expense: ExpenseItem } | null>(null);
  const queryClient = useQueryClient();

  // auto-open create dialog when navigated with a form trigger (e.g. quick create)
  const openForm = useHrmsStore((s) => s.openForm);
  const setOpenForm = useHrmsStore((s) => s.setOpenForm);
  useEffect(() => {
    if (!openForm) return;
    // deferred so the dialog mount happens outside the effect body
    const t = setTimeout(() => {
      setEditing(null);
      setFormOpen(true);
      setOpenForm(null);
    }, 0);
    return () => clearTimeout(t);
  }, [openForm, setOpenForm]);

  const query = useQuery({ queryKey: ["expenses"], queryFn: () => apiGet<ExpensesPayload>("/api/expenses") });

  const actionMutation = useMutation({
    mutationFn: async (c: { type: "submit" | "withdraw"; expense: ExpenseItem }) =>
      apiPost<{ expense: ExpenseItem }>("/api/expenses", {
        action: c.type === "submit" ? "submit" : "withdraw",
        id: c.expense.id,
      }),
    onSuccess: (_res, vars) => {
      toast.success(
        vars.type === "submit"
          ? `${vars.expense.code} submitted for approval`
          : `${vars.expense.code} withdrawn`
      );
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Action failed. Please retry.");
    },
  });

  const counts = useMemo(() => {
    const items = query.data?.items ?? [];
    const c: Record<string, number> = { all: items.length };
    for (const t of TABS) c[t.value] = items.filter((e) => inTab(e, t.value)).length;
    return c;
  }, [query.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses & Reimbursements"
        subtitle="Claims, approvals and payouts"
        icon={<Receipt className="h-4.5 w-4.5" />}
        actions={
          <Button size="sm" className="h-8 gap-1" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> New Expense
          </Button>
        }
      />

      <DataState query={query} skeleton={<DataSkeleton />}>
        {(data) => (
          <ExpensesBody
            items={data.items}
            tab={tab}
            counts={counts}
            onTabChange={setTab}
            onNew={() => { setEditing(null); setFormOpen(true); }}
            onEdit={(e) => { setEditing(e); setFormOpen(true); }}
            onSubmit={(e) => setConfirm({ type: "submit", expense: e })}
            onWithdraw={(e) => setConfirm({ type: "withdraw", expense: e })}
          />
        )}
      </DataState>

      <ExpenseFormDialog
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        editing={editing}
      />

      {confirm ? (
        <AlertDialog open onOpenChange={(o) => { if (!o) setConfirm(null); }}>
          <AlertDialogContent className="sm:max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm.type === "submit" ? "Submit for approval?" : "Withdraw expense?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm.type === "submit"
                  ? `${confirm.expense.code} · ${fmtINR(confirm.expense.amount)} will be routed to your manager and then finance for approval. You can withdraw it while it is pending.`
                  : `${confirm.expense.code} · ${fmtINR(confirm.expense.amount)} will be withdrawn and cannot be resubmitted. Create a new expense if needed.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={cn(confirm.type === "withdraw" && "bg-danger text-white hover:bg-danger/90")}
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate(confirm)}
              >
                {confirm.type === "submit" ? "Submit" : "Withdraw"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

// ── body (needs data) ──────────────────────────────────────
function ExpensesBody({
  items, tab, counts, onTabChange, onNew, onEdit, onSubmit, onWithdraw,
}: {
  items: ExpenseItem[];
  tab: string;
  counts: Record<string, number>;
  onTabChange: (t: string) => void;
  onNew: () => void;
  onEdit: (e: ExpenseItem) => void;
  onSubmit: (e: ExpenseItem) => void;
  onWithdraw: (e: ExpenseItem) => void;
}) {
    const filtered = items.filter((e) => inTab(e, tab));
    const monthItems = items.filter((e) => isThisMonthIST(e.expenseDate));
    const monthClaimed = monthItems
      .filter((e) => CLAIMED_STATUSES.includes(e.status))
      .reduce((a, e) => a + e.amount, 0);
    const monthPending = monthItems
      .filter((e) => PENDING_STATUSES.includes(e.status))
      .reduce((a, e) => a + e.amount, 0);
    const monthReimbursed = monthItems
      .filter((e) => e.status === "PAID")
      .reduce((a, e) => a + e.amount, 0);

    return (
      <>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Claimed · this month" value={fmtINR(monthClaimed)} icon={<Receipt className="h-4 w-4" />} hint="Submitted + approved + paid" />
          <StatCard label="Pending · this month" value={fmtINR(monthPending)} tone="warning" icon={<Clock className="h-4 w-4" />} hint="Awaiting manager / finance" />
          <StatCard label="Reimbursed · this month" value={fmtINR(monthReimbursed)} tone="success" icon={<CircleCheck className="h-4 w-4" />} hint="Paid to your bank account" />
        </div>

        <div className="space-y-3">
          <Tabs value={tab} onValueChange={onTabChange}>
            <div className="w-full overflow-x-auto pb-px">
              <TabsList className="h-9 w-max">
                {TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="px-3 text-xs">
                    {t.label}
                    {counts[t.value] > 0 ? <span className="ml-1 tabular text-[10px] text-muted-foreground">{counts[t.value]}</span> : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>

          {filtered.length === 0 ? (
            <EmptyState
              title={items.length === 0 ? "No expenses yet" : "Nothing in this view"}
              message={items.length === 0
                ? "Draft an expense, attach the receipt reference and submit it for approval."
                : "Try another filter tab to see your other claims."}
              action={items.length === 0 ? (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onNew}>
                  <Plus className="h-3.5 w-3.5" /> New Expense
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((e) => (
                <ExpenseCard
                  key={e.id}
                  expense={e}
                  onEdit={() => onEdit(e)}
                  onSubmit={() => onSubmit(e)}
                  onWithdraw={() => onWithdraw(e)}
                />
              ))}
            </div>
          )}
        </div>
      </>
    );
}

// ── expense card ─────────────────────────────────────────────
function ExpenseCard({
  expense: e, onEdit, onSubmit, onWithdraw,
}: {
  expense: ExpenseItem;
  onEdit: () => void;
  onSubmit: () => void;
  onWithdraw: () => void;
}) {
  const meta = CATEGORY_META[e.category] ?? CATEGORY_META.OTHER;
  const Icon = meta.icon;

  return (
    <Card className="shadow-none">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] font-medium text-muted-foreground">{e.code}</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0 text-[11px] font-medium text-muted-foreground">
                <Icon className="h-3 w-3" /> {meta.label}
              </span>
              <StatusBadge status={e.status} label={statusLabel(e.status)} />
            </div>
            <p className="mt-1.5 truncate text-sm font-medium text-foreground">
              {e.merchant ?? e.description ?? meta.label}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <span>{fmtDateShort(e.expenseDate)}</span>
              {e.project ? (
                <span className="rounded-full bg-accent px-1.5 py-0 text-[10px] font-medium text-accent-foreground">{e.project}</span>
              ) : null}
              {e.receiptName ? (
                <span className="inline-flex max-w-[160px] items-center gap-1 truncate">
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate">{e.receiptName}</span>
                </span>
              ) : null}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular text-foreground">{fmtINR(e.amount)}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {e.submittedAt ? `filed ${relativeTime(e.submittedAt)}` : "not filed yet"}
            </p>
          </div>
        </div>

        {e.description && e.merchant ? (
          <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{e.description}</p>
        ) : null}

        {e.decisionNote ? (
          <div className={cn(
            "mt-2 rounded-md border-l-2 px-2.5 py-1.5 text-xs",
            e.status === "REJECTED"
              ? "border-danger/50 bg-danger-soft text-danger"
              : "border-primary/40 bg-accent text-accent-foreground"
          )}>
            <span className="font-semibold">
              {e.status === "REJECTED" ? "Rejected" : "Decision"} · {fmtDateShort(e.decidedAt)}:
            </span>{" "}
            {e.decisionNote}
          </div>
        ) : null}

        <ExpenseTimeline status={e.status} paidAt={e.paidAt} />

        {(e.status === "DRAFT" || e.status === "SUBMITTED") ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
            {e.status === "DRAFT" ? (
              <>
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={onSubmit}>
                  <Send className="h-3 w-3" /> Submit for approval
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onEdit}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-danger hover:text-danger" onClick={onWithdraw}>
                <Undo2 className="h-3 w-3" /> Withdraw
              </Button>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── status timeline (Draft → Submitted → Manager → Finance → Paid) ──
function ExpenseTimeline({ status, paidAt }: { status: string; paidAt: string | null }) {
  const rejected = status === "REJECTED";
  const cancelled = status === "CANCELLED";
  const idx = TIMELINE_STEPS.findIndex((s) => s.key === status);
  const reached = rejected ? 2 : cancelled ? 1 : idx + 1;

  return (
    <div className="mt-2.5 flex items-start">
      {TIMELINE_STEPS.map((s, i) => {
        const done = i < reached;
        const inFlight = !rejected && !cancelled && i === reached;
        return (
          <div key={s.key} className="flex items-start">
            <div className="flex w-12 flex-col items-center gap-1 sm:w-14">
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full border",
                  done && "border-success/40 bg-success text-white",
                  inFlight && "border-primary/40 bg-primary/15",
                  !done && !inFlight && "border-border bg-muted"
                )}
              >
                {done ? <Check className="h-2.5 w-2.5" /> : null}
              </span>
              <span className={cn(
                "text-center text-[9px] font-medium uppercase leading-none",
                done ? "text-foreground" : "text-muted-foreground/70"
              )}>
                {s.label}
              </span>
            </div>
            {i < TIMELINE_STEPS.length - 1 ? (
              <div className={cn("mt-[7px] h-0.5 min-w-2 flex-1", i + 1 < reached ? "bg-success/50" : "bg-border")} />
            ) : null}
          </div>
        );
      })}
      {rejected || cancelled ? (
        <span className="ml-1.5 mt-0.5 inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-medium text-danger">
          <Ban className="h-3 w-3" /> {rejected ? "Rejected" : "Withdrawn"}
        </span>
      ) : status === "PAID" && paidAt ? (
        <span className="ml-1.5 mt-0.5 inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">
          <FileCheck2 className="h-3 w-3" /> {fmtDateShort(paidAt)}
        </span>
      ) : null}
    </div>
  );
}

// ── create / edit dialog ─────────────────────────────────────
function ExpenseFormDialog({
  open, onOpenChange, editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: ExpenseItem | null;
}) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(editing?.category ?? "");
  const [date, setDate] = useState(
    editing ? editing.expenseDate.slice(0, 10) : dayIST(new Date()).toISOString().slice(0, 10)
  );
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [merchant, setMerchant] = useState(editing?.merchant ?? "");
  const [project, setProject] = useState(editing?.project ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [receiptName, setReceiptName] = useState(editing?.receiptName ?? "");
  const [errors, setErrors] = useState<FormErrors>({});

  function resetForm() {
    setCategory("");
    setDate(dayIST(new Date()).toISOString().slice(0, 10));
    setAmount("");
    setMerchant("");
    setProject("");
    setDescription("");
    setReceiptName("");
    setErrors({});
  }

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!category) errs.category = "Select a category.";
    if (!date) errs.date = "Expense date is required.";
    else if (Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) errs.date = "Enter a valid date.";
    const n = Number(amount);
    if (!amount.trim()) errs.amount = "Amount is required.";
    else if (!Number.isFinite(n) || n <= 0) errs.amount = "Enter an amount greater than ₹0.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const mutation = useMutation({
    mutationFn: (payload: ExpensePayload) => apiPost<{ expense: ExpenseItem }>("/api/expenses", payload),
    onSuccess: (res) => {
      toast.success(
        editing ? `${res.expense.code} updated` : `${res.expense.code} saved as draft`,
        { description: editing ? undefined : "Review it and submit for approval when ready." }
      );
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not save the expense. Please retry.");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const payload: ExpensePayload = {
      category,
      expenseDate: date,
      amount: Number(amount),
      merchant: merchant.trim() || undefined,
      project: project.trim() || undefined,
      description: description.trim() || undefined,
      receiptName: receiptName.trim() || undefined,
    };
    if (editing) {
      payload.action = "update";
      payload.id = editing.id;
    }
    mutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.code}` : "New Expense"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update your draft before submitting it for approval." : "Draft an expense claim. Attach the receipt reference for faster approval."}
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
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_META).map(([value, m]) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2"><m.icon className="h-3.5 w-3.5" /> {m.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category ? <p className="text-[11px] text-danger">{errors.category}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Expense date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setErrors((er) => ({ ...er, date: undefined })); }}
                  className="h-9"
                />
                {errors.date ? <p className="text-[11px] text-danger">{errors.date}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Amount (₹)</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setErrors((er) => ({ ...er, amount: undefined })); }}
                  className="h-9 tabular"
                />
                {errors.amount ? <p className="text-[11px] text-danger">{errors.amount}</p> : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Merchant</Label>
                <Input
                  placeholder="e.g. Ola Cabs"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="e.g. Acme Corp"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                rows={2}
                placeholder="What was this expense for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Receipt <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="file"
                accept="image/*,.pdf"
                className="h-9 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-foreground"
                onChange={(e) => setReceiptName(e.target.files?.[0]?.name ?? "")}
              />
              {receiptName ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[220px] truncate">{receiptName}</span>
                  <button
                    type="button"
                    className="ml-0.5 rounded-sm p-0.5 hover:bg-accent"
                    aria-label="Remove receipt"
                    onClick={() => setReceiptName("")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : null}
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : editing ? "Save Changes" : "Save Draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
