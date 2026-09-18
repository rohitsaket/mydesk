"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, BadgeCheck, CheckCircle2, RefreshCw, Loader2, Users, Building2,
  Landmark, GraduationCap, CalendarHeart, Gift, BellRing, PenLine, Trash2, X, Sparkles,
} from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/hrms/client";
import type { AnnouncementItem } from "@/lib/hrms/types";
import { relativeTime } from "@/lib/hrms/time";
import { useHrmsStore } from "@/lib/hrms/store";
import { PageHeader, EmptyState, DataState } from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const RISE = "animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both";

const CATEGORY_META: Record<string, { label: string; icon: typeof Megaphone }> = {
  GENERAL: { label: "General", icon: Megaphone },
  POLICY: { label: "Policy", icon: Landmark },
  EVENT: { label: "Event", icon: CalendarHeart },
  HOLIDAY: { label: "Holiday", icon: Gift },
  BENEFITS: { label: "Benefits", icon: GraduationCap },
};

const PRIORITY_STYLES: Record<string, string> = {
  NORMAL: "bg-muted text-muted-foreground border-border",
  IMPORTANT: "bg-[var(--warning-soft)] text-[#B54708] border-[var(--warning)]/25",
  CRITICAL: "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/20",
};

const LEVEL_LABELS: Record<string, string> = {
  COMPANY: "All Company",
  BRANCH: "Branch",
  DEPARTMENT: "Department",
  EMPLOYEE: "Direct",
};

type ComposeForm = {
  title: string; body: string; level: string; category: string; priority: string; requiresAck: boolean;
};

const EMPTY_FORM: ComposeForm = {
  title: "", body: "", level: "COMPANY", category: "GENERAL", priority: "NORMAL", requiresAck: false,
};

export default function AnnouncementsView() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<string>("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);
  const employee = useHrmsStore((s) => s.employee);
  const canManage = employee?.role === "HR" || employee?.role === "ADMIN";
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState<ComposeForm>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["announcements"],
    queryFn: () => apiGet<{ items: AnnouncementItem[] }>("/api/announcements"),
    staleTime: 30_000,
  });

  const items = query.data?.items ?? [];

  const categories = useMemo(() => {
    const set = new Map<string, number>();
    items.forEach((a) => set.set(a.category, (set.get(a.category) ?? 0) + 1));
    return [...set.entries()];
  }, [items]);

  const needsAckCount = items.filter((a) => a.requiresAck && !a.acked).length;

  const filtered = useMemo(() => {
    if (category === "ALL") return items;
    if (category === "NEEDS_ACK") return items.filter((a) => a.requiresAck && !a.acked);
    return items.filter((a) => a.category === category);
  }, [items, category]);

  const ackMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ acked: boolean }>("/api/announcements", { action: "ack", id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
      void queryClient.invalidateQueries({ queryKey: ["desk"] });
      toast.success("Acknowledged", { description: "Thank you — your acknowledgement has been recorded." });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not record acknowledgement. Please retry.");
    },
  });

  const titleValid = form.title.trim().length >= 5 && form.title.trim().length <= 120;
  const bodyValid = form.body.trim().length >= 10 && form.body.trim().length <= 2000;

  const composeMutation = useMutation({
    mutationFn: () => apiPost<{ item: AnnouncementItem }>("/api/announcements", { action: "compose", ...form, title: form.title.trim(), body: form.body.trim() }),
    onSuccess: (_data, _vars) => {
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
      void queryClient.invalidateQueries({ queryKey: ["desk"] });
      setComposeOpen(false);
      setForm(EMPTY_FORM);
      toast.success("Announcement published", { description: "It is now visible to the intended audience." });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not publish the announcement. Please retry.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ deleted: boolean }>("/api/announcements", { action: "delete", id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
      void queryClient.invalidateQueries({ queryKey: ["desk"] });
      setConfirmDelete(null);
      toast.success("Announcement removed");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not remove the announcement. Please retry.");
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Megaphone className="h-5 w-5" />}
        title="Announcements"
        subtitle={needsAckCount > 0 ? `${needsAckCount} announcement${needsAckCount > 1 ? "s" : ""} need your acknowledgement` : "Company news, policies and events"}
        actions={
          <div className="flex items-center gap-2">
            {canManage ? (
              <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setComposeOpen(true); }}>
                <PenLine className="mr-1.5 h-3.5 w-3.5" /> New announcement
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", query.isFetching && "animate-spin")} /> Refresh
            </Button>
          </div>
        }
      />
      <div className="h-1 w-28 rounded-full bg-gradient-to-r from-primary via-[var(--success)] to-[var(--warning)]" />

      <DataState query={query} errorTitle="Could not load announcements">
        {() => (items.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="No announcements"
            message="When your company publishes news, policies or events, they'll appear here."
          />
        ) : (
          <div className="space-y-3">
            {/* filter chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip active={category === "ALL"} onClick={() => setCategory("ALL")}>
                All <span className="ml-1 opacity-60">{items.length}</span>
              </FilterChip>
              {needsAckCount > 0 ? (
                <FilterChip active={category === "NEEDS_ACK"} onClick={() => setCategory("NEEDS_ACK")} accent>
                  <BellRing className="mr-1 h-3 w-3" /> Needs your ack <span className="ml-1 opacity-70">{needsAckCount}</span>
                </FilterChip>
              ) : null}
              {categories.map(([cat, count]) => {
                const meta = CATEGORY_META[cat] ?? { label: cat.toLowerCase(), icon: Megaphone };
                return (
                  <FilterChip key={cat} active={category === cat} onClick={() => setCategory(cat)}>
                    {meta.label} <span className="ml-1 opacity-60">{count}</span>
                  </FilterChip>
                );
              })}
            </div>

            {/* feed */}
            {filtered.length === 0 ? (
              <EmptyState title="Nothing here" message="No announcements match this filter." />
            ) : (
              <div className="max-h-[calc(100vh-21rem)] space-y-3 overflow-y-auto scroll-thin pr-0.5">
                {filtered.map((a, i) => {
                  const meta = CATEGORY_META[a.category] ?? { label: a.category.toLowerCase(), icon: Megaphone };
                  const CatIcon = meta.icon;
                  const isOpen = expanded === a.id;
                  const needsAck = a.requiresAck && !a.acked;
                  return (
                    <article
                      key={a.id}
                      className={cn(
                        "group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30",
                        RISE,
                        a.priority === "CRITICAL" && "border-l-4 border-l-[var(--danger)]",
                        a.priority === "IMPORTANT" && "border-l-4 border-l-[var(--warning)]",
                        a.priority === "NORMAL" && "border-l-4 border-l-transparent",
                        needsAck && "bg-[var(--warning-soft)]/30",
                      )}
                      style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            a.priority === "CRITICAL" ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                              : a.priority === "IMPORTANT" ? "bg-[var(--warning-soft)] text-[#B54708]"
                              : "bg-primary/10 text-primary",
                          )}>
                            <CatIcon className="h-4.5 w-4.5" />
                          </span>
                          <div className="min-w-0">
                            <h2 className="text-sm font-semibold leading-snug text-foreground">{a.title}</h2>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                {a.level === "COMPANY" ? <Building2 className="h-3 w-3" /> : a.level === "BRANCH" ? <Landmark className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                                {LEVEL_LABELS[a.level] ?? a.level}
                              </span>
                              <span aria-hidden>·</span>
                              <span>{relativeTime(a.publishedAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", PRIORITY_STYLES[a.priority] ?? PRIORITY_STYLES.NORMAL)}>
                            {a.priority}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{meta.label}</span>
                        </div>
                      </div>

                      <p className={cn(
                        "mt-2.5 text-xs leading-relaxed text-muted-foreground",
                        !isOpen && "line-clamp-3",
                      )}>
                        {a.body}
                      </p>
                      {a.body.length > 180 ? (
                        <button
                          className="mt-1 text-[11px] font-medium text-primary hover:underline"
                          onClick={() => setExpanded(isOpen ? null : a.id)}
                        >
                          {isOpen ? "Show less" : "Read more"}
                        </button>
                      ) : null}

                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                        <span className="text-[11px] text-muted-foreground">
                          {a.requiresAck ? (
                            <>{a.acknowledged > 0 ? <>{a.acknowledged} acknowledged</> : "No acknowledgements yet"}</>
                          ) : "For your information"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {confirmDelete === a.id ? (
                            <>
                              <span className="text-[11px] font-medium text-muted-foreground">Remove this?</span>
                              <Button
                                size="sm" variant="destructive" className="h-7 gap-1 px-2 text-xs"
                                disabled={deleteMutation.isPending && deleteMutation.variables === a.id}
                                onClick={() => deleteMutation.mutate(a.id)}
                              >
                                {deleteMutation.isPending && deleteMutation.variables === a.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                Delete
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setConfirmDelete(null)}>
                                <X className="h-3.5 w-3.5" /> Keep
                              </Button>
                            </>
                          ) : canManage ? (
                            <Button
                              size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-[var(--danger)]"
                              onClick={() => setConfirmDelete(a.id)}
                              aria-label={`Remove announcement ${a.title}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </Button>
                          ) : null}
                          {a.requiresAck ? (
                            a.acked ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-success">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                className="h-7 gap-1.5 text-xs"
                                disabled={ackMutation.isPending && ackMutation.variables === a.id}
                                onClick={() => ackMutation.mutate(a.id)}
                              >
                                {ackMutation.isPending && ackMutation.variables === a.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <BadgeCheck className="h-3.5 w-3.5" />}
                                Acknowledge
                              </Button>
                            )
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* footer meta */}
            <p className="text-center text-[11px] text-muted-foreground">
              Showing {filtered.length} of {items.length} announcements · published by HR & Admin
            </p>
          </div>
        ))}
      </DataState>

      {/* compose dialog (HR / Admin) */}
      <Dialog open={composeOpen} onOpenChange={(open) => { setComposeOpen(open); if (!open) composeMutation.reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> New announcement
            </DialogTitle>
            <DialogDescription>
              Publish a company update. It appears instantly on every employee's desk.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title">Title</Label>
              <Input
                id="ann-title" placeholder="e.g. Diwali bonus credited this week" maxLength={120}
                value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                aria-invalid={form.title.length > 0 && !titleValid}
              />
              <p className={cn("text-[11px]", form.title.length > 0 && !titleValid ? "text-[var(--danger)]" : "text-muted-foreground")}>
                {form.title.trim().length}/120 characters {form.title.length > 0 && form.title.trim().length < 5 ? "· at least 5 required" : ""}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ann-body">Message</Label>
              <Textarea
                id="ann-body" rows={5} placeholder="Share the details your team needs to know…" maxLength={2000}
                value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                aria-invalid={form.body.length > 0 && !bodyValid}
                className="resize-none"
              />
              <p className={cn("text-[11px]", form.body.length > 0 && !bodyValid ? "text-[var(--danger)]" : "text-muted-foreground")}>
                {form.body.trim().length}/2000 characters {form.body.length > 0 && form.body.trim().length < 10 ? "· at least 10 required" : ""}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_META).map(([value, meta]) => (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2"><meta.icon className="h-3.5 w-3.5" /> {meta.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <Select value={form.level} onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMPANY">All Company</SelectItem>
                    <SelectItem value="BRANCH">Branch</SelectItem>
                    <SelectItem value="DEPARTMENT">Department</SelectItem>
                    <SelectItem value="EMPLOYEE">Direct</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Priority">
                {(Object.keys(PRIORITY_STYLES) as string[]).map((p) => (
                  <button
                    key={p} type="button" role="radio" aria-checked={form.priority === p}
                    onClick={() => setForm((f) => ({ ...f, priority: p }))}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition-all",
                      form.priority === p
                        ? p === "CRITICAL"
                          ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)] shadow-sm"
                          : p === "IMPORTANT"
                            ? "border-[var(--warning)] bg-[var(--warning-soft)] text-[#B54708] shadow-sm"
                            : "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {form.priority !== "NORMAL" ? (
                <p className="text-[11px] text-muted-foreground">
                  {form.priority === "CRITICAL" ? "Critical items show a red accent on every card and sort first." : "Important items show an amber accent and sort above normal."}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="ann-ack" className="text-xs">Require acknowledgement</Label>
                <p className="text-[11px] text-muted-foreground">Employees must acknowledge before it clears from their desk.</p>
              </div>
              <Switch
                id="ann-ack" checked={form.requiresAck}
                onCheckedChange={(v) => setForm((f) => ({ ...f, requiresAck: v }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setComposeOpen(false)} disabled={composeMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => composeMutation.mutate()}
              disabled={!titleValid || !bodyValid || composeMutation.isPending}
            >
              {composeMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Megaphone className="mr-1.5 h-3.5 w-3.5" />}
              Publish announcement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({ active, onClick, accent, children }: {
  active: boolean; onClick: () => void; accent?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : accent
            ? "border-[var(--warning)]/40 bg-[var(--warning-soft)] text-[#B54708] hover:border-[var(--warning)]"
            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
