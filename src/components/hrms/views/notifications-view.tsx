"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet, apiPost, ApiError } from "@/lib/hrms/client";
import { relativeTime } from "@/lib/hrms/time";
import type { ViewKey } from "@/lib/hrms/types";
import { PageHeader, EmptyState, DataState, DataSkeleton } from "@/components/hrms/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Bell, Plane, CalendarClock, IndianRupee, ListTodo, Megaphone, Receipt,
  ClipboardCheck, Clock, ChevronRight, CheckCheck, Loader2, FileBadge,
  type LucideIcon,
} from "lucide-react";

// ── types ───────────────────────────────────────────────────
interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

interface NotificationsPayload {
  items: NotificationItem[];
  unread: number;
}

const TYPE_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  LEAVE: { label: "Leave", icon: Plane, color: "#0EA5E9" },
  ATTENDANCE: { label: "Attendance", icon: CalendarClock, color: "#F59E0B" },
  PAYROLL: { label: "Payroll", icon: IndianRupee, color: "#12B76A" },
  TASK: { label: "Task", icon: ListTodo, color: "#2563EB" },
  ANNOUNCEMENT: { label: "Announcement", icon: Megaphone, color: "#EC4899" },
  EXPENSE: { label: "Expense", icon: Receipt, color: "#8B5CF6" },
  APPROVAL: { label: "Approval", icon: ClipboardCheck, color: "#06B6D4" },
  SHIFT: { label: "Shift", icon: Clock, color: "#F97316" },
  DOCUMENT: { label: "Document", icon: FileBadge, color: "#14B8A6" },
  SYSTEM: { label: "System", icon: Bell, color: "#64748B" },
};

const FILTER_TYPES = ["LEAVE", "ATTENDANCE", "PAYROLL", "TASK", "ANNOUNCEMENT", "EXPENSE", "APPROVAL", "DOCUMENT"] as const;

function typeMeta(type: string): { label: string; icon: LucideIcon; color: string } {
  return TYPE_META[type] ?? { label: type.replace(/_/g, " "), icon: Bell, color: "#64748B" };
}

// ── main view ───────────────────────────────────────────────
export default function NotificationsView() {
  const setView = useHrmsStore((s) => s.setView);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (tab === "unread") params.set("unread", "1");
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    const qs = params.toString();
    return `/api/notifications${qs ? `?${qs}` : ""}`;
  }, [tab, typeFilter]);

  const query = useQuery({
    queryKey: ["notifications", tab, typeFilter],
    queryFn: () => apiGet<NotificationsPayload>(url),
    staleTime: 15_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["desk"] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ updated: boolean }>("/api/notifications", { action: "read", id }),
    onSuccess: invalidate,
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not mark the notification as read.");
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => apiPost<{ updated: boolean }>("/api/notifications", { action: "read-all" }),
    onSuccess: () => {
      toast.success("All notifications marked as read");
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not mark notifications as read.");
    },
  });

  function openNotification(n: NotificationItem) {
    if (!n.read) markReadMutation.mutate(n.id);
    if (n.link) setView(n.link as ViewKey);
  }

  const unread = query.data?.unread ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Alerts across attendance, leave, payroll, tasks and approvals"
        icon={<Bell className="h-4.5 w-4.5" />}
        actions={
          <Button
            size="sm" variant="outline" className="h-8 gap-1"
            disabled={markAllMutation.isPending || unread === 0}
            onClick={() => markAllMutation.mutate()}
          >
            {markAllMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Mark all read
          </Button>
        }
      />

      <DataState query={query} skeleton={<DataSkeleton />}>
        {(data) => (
          <>
            {/* filter row */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="px-3 text-xs">All</TabsTrigger>
                  <TabsTrigger value="unread" className="gap-1.5 px-3 text-xs">
                    Unread
                    {data.unread > 0 ? (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular text-primary-foreground">{data.unread}</span>
                    ) : null}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger size="sm" className="w-full sm:w-48">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All types</SelectItem>
                  {FILTER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{typeMeta(t).label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {data.items.length === 0 ? (
              <EmptyState
                title="You're all caught up."
                message={tab === "unread" || typeFilter !== "ALL" ? "No notifications match the current filters." : "New alerts will appear here as things happen."}
                icon={<CheckCheck className="h-5 w-5 text-success" />}
              />
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto scroll-thin pr-1">
                {data.items.map((n) => (
                  <NotificationRow key={n.id} notification={n} onOpen={openNotification} />
                ))}
              </div>
            )}

            {data.items.length > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Showing {data.items.length} notification{data.items.length === 1 ? "" : "s"} · {data.unread} unread
              </p>
            ) : null}
          </>
        )}
      </DataState>
    </div>
  );
}

// ── notification row ────────────────────────────────────────
function NotificationRow({
  notification, onOpen,
}: {
  notification: NotificationItem;
  onOpen: (n: NotificationItem) => void;
}) {
  const meta = typeMeta(notification.type);
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={cn(
        "focus-ring flex w-full items-start gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors",
        notification.read
          ? "border-border hover:bg-accent/40"
          : "border-primary/30 bg-primary/2.5 hover:border-primary/50 hover:bg-primary/5"
      )}
    >
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("min-w-0 flex-1 truncate text-sm text-foreground", notification.read ? "font-medium" : "font-semibold")}>
            {notification.title}
          </p>
          {!notification.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
        </div>
        {notification.body ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
        ) : null}
        <p className="mt-1 text-[10px] text-muted-foreground">
          <span className="font-medium text-muted-foreground/80">{meta.label}</span> · {relativeTime(notification.createdAt)}
        </p>
      </div>

      {notification.link ? (
        <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
      ) : null}
    </button>
  );
}
