"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/hrms/client";
import { ApiError } from "@/lib/hrms/client";
import {
  PageHeader, DataState, EmptyState, StatCard, StatusBadge, SectionCard,
} from "@/components/hrms/shared";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Target, CalendarClock, TrendingUp, CheckCircle2, AlertTriangle, Loader2, Gauge, SlidersHorizontal,
} from "lucide-react";
import { fmtDate } from "@/lib/hrms/time";

interface GoalItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  metric: string | null;
  target: number;
  current: number;
  unit: string;
  dueDate: string | null;
  status: string;
  quarter: string;
  progress: number;
}

interface PerformanceData {
  goals: GoalItem[];
  summary: { active: number; completed: number; atRisk: number; avgProgress: number; total: number };
}

const CATEGORY_STYLES: Record<string, string> = {
  DELIVERABLE: "bg-info-soft text-info border-info/20",
  LEARNING: "bg-accent text-accent-foreground border-accent",
  PROCESS: "bg-warning-soft text-[#B54708] border-warning/25",
  REVENUE: "bg-success-soft text-success border-success/20",
};

const CATEGORY_LABELS: Record<string, string> = {
  DELIVERABLE: "Deliverable",
  LEARNING: "Learning",
  PROCESS: "Process",
  REVENUE: "Revenue",
};

function isOverdue(goal: GoalItem): boolean {
  if (!goal.dueDate || goal.status === "COMPLETED") return false;
  const due = new Date(goal.dueDate);
  const today = new Date();
  return due.getTime() < today.getTime() - 86400000; // end of yesterday
}

function GoalCard({ goal, onUpdate, pending }: {
  goal: GoalItem;
  onUpdate: () => void;
  pending: boolean;
}) {
  const isMinUnit = goal.unit === "min" || goal.unit === "mins" || goal.unit === "minutes";
  const editable = goal.status !== "COMPLETED";

  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">{goal.title}</p>
            <Badge variant="outline" className={CATEGORY_STYLES[goal.category] ?? "bg-muted text-muted-foreground border-border"}>
              {CATEGORY_LABELS[goal.category] ?? goal.category}
            </Badge>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
              {goal.quarter}
            </Badge>
          </div>
          {goal.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{goal.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={goal.status} />
          {editable ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={onUpdate}
              disabled={pending}
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <SlidersHorizontal className="h-3 w-3" />}
              Update progress
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Progress value={goal.progress} className={goal.status === "AT_RISK" ? "h-2 [&>div]:bg-warning" : goal.status === "COMPLETED" ? "h-2 [&>div]:bg-success" : "h-2"} />
        <span className="w-11 shrink-0 text-right text-xs font-semibold tabular text-foreground">{goal.progress}%</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="tabular">
          {goal.metric ? `${goal.metric}: ` : ""}
          <span className="font-medium text-foreground">{goal.current}</span> / {goal.target} {goal.unit}
          {isMinUnit ? " (lower is better)" : ""}
        </span>
        {goal.dueDate ? (
          <span className={isOverdue(goal) ? "font-medium text-danger" : ""}>
            <CalendarClock className="mr-0.5 inline h-3 w-3" />
            {fmtDate(goal.dueDate)}
            {isOverdue(goal) ? " · overdue" : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function PerformanceView() {
  const [quarter, setQuarter] = useState("ALL");
  const [editing, setEditing] = useState<GoalItem | null>(null);
  const [sliderValue, setSliderValue] = useState(0);
  const queryClient = useQueryClient();

  const performanceQuery = useQuery({
    queryKey: ["performance"],
    queryFn: () => apiGet<PerformanceData>("/api/performance"),
  });

  const progressMutation = useMutation({
    mutationFn: (vars: { id: string; current: number }) =>
      apiPatch<{ goal: GoalItem }>(`/api/performance/${vars.id}`, { current: vars.current }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["performance"] });
      const previous = queryClient.getQueryData<PerformanceData>(["performance"]);
      queryClient.setQueryData<PerformanceData>(["performance"], (old) => {
        if (!old) return old;
        const goals = old.goals.map((g) => {
          if (g.id !== vars.id) return g;
          const clamped = Math.max(0, Math.min(vars.current, g.target));
          const isMin = g.unit === "min" || g.unit === "mins" || g.unit === "minutes";
          const ratio = isMin ? g.target / Math.max(clamped, 0.0001) : clamped / g.target;
          return {
            ...g,
            current: clamped,
            status: clamped >= g.target ? "COMPLETED" : g.status === "COMPLETED" ? "ACTIVE" : g.status,
            progress: Math.round(Math.max(0, Math.min(1, ratio)) * 100),
          };
        });
        const avg = goals.length ? Math.round(goals.reduce((a, g) => a + g.progress, 0) / goals.length) : 0;
        return {
          goals,
          summary: {
            ...old.summary,
            active: goals.filter((g) => g.status === "ACTIVE").length,
            completed: goals.filter((g) => g.status === "COMPLETED").length,
            atRisk: goals.filter((g) => g.status === "AT_RISK").length,
            avgProgress: avg,
          },
        };
      });
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["performance"], context.previous);
      toast.error(err instanceof ApiError ? err.message : "Could not update progress");
    },
    onSuccess: (data, vars) => {
      if (data.goal.status === "COMPLETED" && data.goal.progress === 100) {
        toast.success(`Goal completed — ${data.goal.title}`);
      } else {
        toast.success("Progress updated");
      }
      if (editing?.id === vars.id) setEditing(null);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["performance"] });
    },
  });

  const quarters = useMemo(() => {
    const qs = new Set((performanceQuery.data?.goals ?? []).map((g) => g.quarter));
    return [...qs].sort();
  }, [performanceQuery.data]);

  const currentQuarter = useMemo(() => {
    const m = new Date().getMonth();
    return `Q${Math.floor(m / 3) + 1}`;
  }, []);

  const filteredGoals = useMemo(() => {
    const goals = performanceQuery.data?.goals ?? [];
    const filtered = quarter === "ALL" ? goals : goals.filter((g) => g.quarter === quarter);
    return [...filtered].sort((a, b) => {
      const rank = (s: string) => (s === "AT_RISK" ? 0 : s === "ACTIVE" ? 1 : 2);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return a.dueDate?.localeCompare(b.dueDate ?? "") ?? 0;
    });
  }, [performanceQuery.data, quarter]);

  const summary = performanceQuery.data?.summary;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Performance"
        subtitle="Goals & progress"
        icon={<Target className="h-4.5 w-4.5" />}
        actions={
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger className="h-9 w-[130px] text-sm">
              <SelectValue placeholder="Quarter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All quarters</SelectItem>
              {quarters.map((q) => (
                <SelectItem key={q} value={q}>{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <DataState query={performanceQuery}>
        {(data) => (
          <div className="space-y-4">
            {/* summary stats */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Active" value={data.summary.active} icon={<TrendingUp className="h-4 w-4" />} hint={`${data.summary.total} total goals`} />
              <StatCard label="Completed" value={data.summary.completed} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
              <StatCard label="At Risk" value={data.summary.atRisk} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} />
              <StatCard label="Avg progress" value={`${data.summary.avgProgress}%`} tone="info" icon={<Gauge className="h-4 w-4" />} />
            </div>

            {/* goals list */}
            <SectionCard title="My Goals" icon={<Target className="h-4 w-4" />}>
              {filteredGoals.length === 0 ? (
                <EmptyState
                  title="No goals in view"
                  message={quarter === "ALL" ? "No goals have been set for you yet." : `No goals recorded for ${quarter}.`}
                />
              ) : (
                <div className="max-h-[60vh] space-y-3 overflow-y-auto scroll-thin pr-1">
                  {filteredGoals.map((g) => (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      pending={progressMutation.isPending && progressMutation.variables?.id === g.id}
                      onUpdate={() => {
                        setEditing(g);
                        setSliderValue(g.current);
                      }}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            {/* self review */}
            <SectionCard title="Self Review" icon={<Gauge className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Review quarter</p>
                  <p className="mt-1 text-sm font-semibold tabular text-foreground">{currentQuarter}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Average progress</p>
                  <p className="mt-1 text-sm font-semibold tabular text-foreground">{summary ? `${summary.avgProgress}%` : "—"}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Goals on track</p>
                  <p className="mt-1 text-sm font-semibold tabular text-foreground">
                    {summary ? `${summary.active + summary.completed} / ${summary.total}` : "—"}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Formal review cycle opens at quarter end. Progress updates are logged for your review conversation.
              </p>
            </SectionCard>
          </div>
        )}
      </DataState>

      {/* progress update dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !progressMutation.isPending) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {editing ? (
            <>
              <DialogHeader>
                <DialogTitle>Update progress</DialogTitle>
                <DialogDescription>
                  {editing.title}
                  {editing.metric ? ` · ${editing.metric}` : ""} — target {editing.target} {editing.unit}
                  {editing.unit === "min" || editing.unit === "mins" || editing.unit === "minutes"
                    ? " (lower is better)"
                    : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div className="flex items-center gap-4">
                  <Slider
                    value={[sliderValue]}
                    min={0}
                    max={Math.max(editing.target, editing.current, 1)}
                    step={Number.isInteger(editing.target) && Number.isInteger(editing.current) ? 1 : 0.5}
                    onValueChange={(v) => setSliderValue(v[0] ?? editing.current)}
                    disabled={progressMutation.isPending}
                    className="flex-1"
                  />
                  <span className="w-16 shrink-0 text-right text-sm font-semibold tabular text-foreground">
                    {sliderValue} <span className="text-xs font-normal text-muted-foreground">{editing.unit}</span>
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Current {editing.current} of {editing.target} {editing.unit} — the goal auto-completes when it
                  reaches the target.
                </p>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setEditing(null)}
                  disabled={progressMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => progressMutation.mutate({ id: editing.id, current: sliderValue })}
                  disabled={progressMutation.isPending}
                >
                  {progressMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Save progress
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
