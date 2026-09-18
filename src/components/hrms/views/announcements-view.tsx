"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, BadgeCheck, CheckCircle2, RefreshCw, Loader2, Users, Building2,
  Landmark, GraduationCap, CalendarHeart, Gift, BellRing,
} from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/hrms/client";
import type { AnnouncementItem } from "@/lib/hrms/types";
import { relativeTime } from "@/lib/hrms/time";
import { PageHeader, EmptyState, DataState, StatusBadge } from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
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

export default function AnnouncementsView() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<string>("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Megaphone className="h-5 w-5" />}
        title="Announcements"
        subtitle={needsAckCount > 0 ? `${needsAckCount} announcement${needsAckCount > 1 ? "s" : ""} need your acknowledgement` : "Company news, policies and events"}
        actions={
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", query.isFetching && "animate-spin")} /> Refresh
          </Button>
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
