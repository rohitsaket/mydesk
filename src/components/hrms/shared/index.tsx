"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Inbox } from "lucide-react";
import type { ReactNode } from "react";

// ── Page header ──────────────────────────────────────────────
export function PageHeader({
  title, subtitle, actions, icon,
}: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {icon ? <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div> : null}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ── Section card ─────────────────────────────────────────────
export function SectionCard({
  title, action, children, className, contentClassName, icon,
}: { title?: string; action?: ReactNode; children: ReactNode; className?: string; contentClassName?: string; icon?: ReactNode }) {
  return (
    <Card className={cn("shadow-none", className)}>
      {title ? (
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {icon}
            {title}
          </CardTitle>
          {action}
        </CardHeader>
      ) : null}
      <CardContent className={cn(title ? "pt-0" : "pt-6", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

// ── Status badge (standardized statuses, never random colors) ─
const STATUS_STYLES: Record<string, string> = {
  WORKING: "bg-success-soft text-success border-success/20",
  ON_BREAK: "bg-warning-soft text-warning border-warning/25",
  CHECKED_OUT: "bg-muted text-muted-foreground border-border",
  NOT_STARTED: "bg-muted text-muted-foreground border-border",
  PENDING: "bg-warning-soft text-[#B54708] border-warning/25",
  APPROVED: "bg-success-soft text-success border-success/20",
  REJECTED: "bg-danger-soft text-danger border-danger/20",
  CANCELLED: "bg-muted text-muted-foreground border-border",
  SUBMITTED: "bg-info-soft text-info border-info/20",
  DRAFT: "bg-muted text-muted-foreground border-border",
  PAID: "bg-success-soft text-success border-success/20",
  MANAGER_APPROVED: "bg-info-soft text-info border-info/20",
  FINANCE_APPROVED: "bg-info-soft text-info border-info/20",
  OPEN: "bg-info-soft text-info border-info/20",
  IN_PROGRESS: "bg-info-soft text-info border-info/20",
  RESOLVED: "bg-success-soft text-success border-success/20",
  CLOSED: "bg-muted text-muted-foreground border-border",
  TODO: "bg-muted text-muted-foreground border-border",
  REVIEW: "bg-warning-soft text-[#B54708] border-warning/25",
  BLOCKED: "bg-danger-soft text-danger border-danger/20",
  COMPLETED: "bg-success-soft text-success border-success/20",
  ACTIVE: "bg-success-soft text-success border-success/20",
  AT_RISK: "bg-warning-soft text-[#B54708] border-warning/25",
  P: "bg-success-soft text-success border-success/20",
  A: "bg-danger-soft text-danger border-danger/20",
  L: "bg-info-soft text-info border-info/20",
  H: "bg-accent text-accent-foreground border-accent",
  WO: "bg-muted text-muted-foreground border-border",
  WFH: "bg-accent text-accent-foreground border-accent",
  OD: "bg-accent text-accent-foreground border-accent",
  HD: "bg-warning-soft text-[#B54708] border-warning/25",
  MP: "bg-danger-soft text-danger border-danger/20",
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("px-1.5 py-0 text-[11px] font-medium whitespace-nowrap", STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border", className)}>
      {label ?? status.replace(/_/g, " ")}
    </Badge>
  );
}

export function TaskStatusBadge({ status, label }: { status: string; label: string }) {
  return <StatusBadge status={status} label={label} />;
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-muted text-muted-foreground border-border",
  MEDIUM: "bg-info-soft text-info border-info/20",
  HIGH: "bg-warning-soft text-[#B54708] border-warning/25",
  URGENT: "bg-danger-soft text-danger border-danger/20",
};

export function PriorityBadge({ priority, label }: { priority: string; label: string }) {
  return (
    <Badge variant="outline" className={cn("px-1.5 py-0 text-[11px] font-medium", PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.MEDIUM)}>
      {label}
    </Badge>
  );
}

// ── Stat / metric card ───────────────────────────────────────
export function StatCard({
  label, value, hint, icon, tone = "default", className,
}: {
  label: string; value: ReactNode; hint?: string; icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const tones = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-[#B54708]",
    danger: "text-danger",
    info: "text-info",
  } as const;
  return (
    <Card className={cn("group shadow-none transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-primary/25 hover:shadow-md active:translate-y-0", className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {icon ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground/70 transition-colors group-hover:bg-primary/10">
              {icon}
            </span>
          ) : null}
        </div>
        <p className={cn("mt-1.5 text-xl font-semibold tabular", tones[tone])}>{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

// ── Empty state ──────────────────────────────────────────────
export function EmptyState({
  title, message, action, icon,
}: { title: string; message?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {message ? <p className="max-w-sm text-xs text-muted-foreground">{message}</p> : null}
      {action}
    </div>
  );
}

// ── Loading / error wrapper ──────────────────────────────────
export function DataState<T>({
  query, children, skeleton, errorTitle = "Unable to load",
}: {
  query: { isLoading: boolean; isError: boolean; refetch: () => void; data?: T };
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
  errorTitle?: string;
}) {
  if (query.isLoading) {
    return <>{skeleton ?? <DataSkeleton />}</>;
  }
  if (query.isError || query.data === undefined) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{errorTitle}</p>
          <p className="text-xs text-muted-foreground">Your connection may have dropped. Please retry.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }
  return <>{children(query.data)}</>;
}

export function DataSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

// ── Initials avatar ──────────────────────────────────────────
export function Initials({ first, last, size = "md" }: { first: string; last: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-11 w-11 text-sm" };
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary", sizes[size])}>
      {`${first.charAt(0)}${last.charAt(0)}`.toUpperCase()}
    </div>
  );
}

// ── key-value row ────────────────────────────────────────────
export function InfoRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-right text-sm font-medium text-foreground", mono && "tabular")}>{value}</span>
    </div>
  );
}
