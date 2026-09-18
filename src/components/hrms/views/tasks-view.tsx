"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/hrms/client";
import {
  fmtTime, fmtDateShort, dayIST, istTime, TASK_STATUS_LABELS, PRIORITY_LABELS,
} from "@/lib/hrms/time";
import {
  PageHeader, SectionCard, PriorityBadge, EmptyState, DataState, DataSkeleton,
} from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ListTodo, Plus, Loader2, Trash2, ChevronRight, Search, CalendarClock,
  Circle, CircleDot, CircleDotDashed, CircleAlert, CheckCircle2, Check,
} from "lucide-react";

// ── types ───────────────────────────────────────────────────
type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  project: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string | null;
  assignedBy: string | null;
  progress: number;
  completedAt: string | null;
  createdAt: string;
}

const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"];
const TASK_PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

/** Click-to-cycle transition applied by the status circle. */
const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  COMPLETED: "TODO",
  BLOCKED: "IN_PROGRESS",
  REVIEW: "COMPLETED",
};

const IST_OFFSET_MS = 330 * 60 * 1000;

/** ISO instant → "YYYY-MM-DDTHH:MM" in IST for datetime-local inputs. */
function isoToDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:MM" (IST wall time) → ISO instant. */
function dateTimeLocalToIso(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return istTime(day, Number(m[4]), Number(m[5])).toISOString();
}

interface DueInfo {
  text: string;
  overdue: boolean;
}

function dueInfo(task: TaskItem, timeFormat: "12h" | "24h"): DueInfo | null {
  if (!task.dueAt) return null;
  const due = new Date(task.dueAt);
  const now = new Date();
  const overdue = task.status !== "COMPLETED" && due.getTime() < now.getTime();
  const sameDay = dayIST(due).getTime() === dayIST(now).getTime();
  const time = fmtTime(due, timeFormat);
  const text = sameDay
    ? `Due today ${time}`
    : overdue
      ? `Due ${fmtDateShort(due)}, ${time}`
      : `Due ${fmtDateShort(due)}${task.status !== "COMPLETED" ? `, ${time}` : ""}`;
  return { text, overdue };
}

// ── main view ───────────────────────────────────────────────
export default function TasksView() {
  const timeFormat = useHrmsStore((s) => s.timeFormat);
  const openForm = useHrmsStore((s) => s.openForm);
  const setOpenForm = useHrmsStore((s) => s.setOpenForm);
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskItem | null>(null);

  const query = useQuery({
    queryKey: ["tasks"],
    queryFn: () => apiGet<{ items: TaskItem[] }>("/api/tasks"),
    staleTime: 30_000,
  });

  // auto-open create dialog when navigated with a form trigger (quick create / desk CTA)
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

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["desk"] });
  };

  const tasks = query.data?.items ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: tasks.length };
    for (const s of TASK_STATUSES) c[s] = tasks.filter((t) => t.status === s).length;
    return c;
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (priorityFilter !== "ALL" && t.priority !== priorityFilter) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter, search]);

  const cycleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      apiPatch<TaskItem>(`/api/tasks/${id}`, { status }),
    onSuccess: (t, vars) => {
      if (vars.status === "COMPLETED") {
        toast.success("Task completed", { description: t.title });
      } else if (t.status === "TODO") {
        toast.success("Task reopened", { description: t.title });
      } else {
        toast.success(`Moved to ${TASK_STATUS_LABELS[t.status]}`, { description: t.title });
      }
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not update the task.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ deleted: boolean }>(`/api/tasks/${id}`),
    onSuccess: (_res, id) => {
      const t = deleteTarget;
      toast.success("Task deleted", { description: t && t.id === id ? t.title : undefined });
      setDeleteTarget(null);
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not delete the task.");
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        subtitle="Your work items, priorities and progress"
        icon={<ListTodo className="h-4.5 w-4.5" />}
        actions={
          <Button size="sm" className="h-8 gap-1" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> New Task
          </Button>
        }
      />

      <DataState query={query} skeleton={<DataSkeleton />}>
        {() => (
          <>
            {/* status chips */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setStatusFilter("ALL")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  statusFilter === "ALL"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                All tasks <span className="ml-1 tabular">{counts.ALL}</span>
              </button>
              {TASK_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter((cur) => (cur === s ? "ALL" : s))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    statusFilter === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  {TASK_STATUS_LABELS[s]} <span className="ml-1 tabular">{counts[s]}</span>
                </button>
              ))}
            </div>

            <SectionCard title="My Tasks" action={<span className="text-[11px] text-muted-foreground">{filtered.length} shown</span>} contentClassName="pt-0">
              {/* filter bar */}
              <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger size="sm" className="w-full sm:w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{TASK_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger size="sm" className="w-full sm:w-40">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All priorities</SelectItem>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tasks by title…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>

              <div className="max-h-96 space-y-2 overflow-y-auto scroll-thin p-1 pt-3">
                {tasks.length === 0 ? (
                  <EmptyState
                    title="No tasks yet"
                    message="Create a task to track your work, or ask your manager to assign one."
                    action={
                      <Button size="sm" className="mt-1 gap-1" onClick={() => { setEditing(null); setFormOpen(true); }}>
                        <Plus className="h-3.5 w-3.5" /> New Task
                      </Button>
                    }
                  />
                ) : filtered.length === 0 ? (
                  <EmptyState
                    title="No tasks match your filters"
                    message="Try clearing the status, priority or search filters."
                  />
                ) : (
                  filtered.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      timeFormat={timeFormat}
                      cycling={cycleMutation.isPending && cycleMutation.variables?.id === t.id}
                      onOpen={() => { setEditing(t); setFormOpen(true); }}
                      onCycle={() => cycleMutation.mutate({ id: t.id, status: STATUS_CYCLE[t.status] })}
                    />
                  ))
                )}
              </div>
            </SectionCard>
          </>
        )}
      </DataState>

      <TaskFormDialog
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        editing={editing}
        onDone={invalidate}
        onRequestDelete={(t) => setDeleteTarget(t)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be permanently removed. Only tasks in To Do status can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Task</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-white hover:bg-danger/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── task row ────────────────────────────────────────────────
function StatusCircleButton({ status, onCycle, busy }: { status: TaskStatus; onCycle: () => void; busy?: boolean }) {
  const styles: Record<TaskStatus, string> = {
    TODO: "border-border text-muted-foreground hover:border-primary hover:text-primary",
    IN_PROGRESS: "border-primary/50 text-primary",
    REVIEW: "border-warning/60 text-[#B54708]",
    BLOCKED: "border-danger/50 text-danger",
    COMPLETED: "border-success/50 bg-success-soft text-success",
  };
  const icons: Record<TaskStatus, ReactNode> = {
    TODO: <Circle className="h-4 w-4" />,
    IN_PROGRESS: <CircleDot className="h-4 w-4" />,
    REVIEW: <CircleDotDashed className="h-4 w-4" />,
    BLOCKED: <CircleAlert className="h-4 w-4" />,
    COMPLETED: <CheckCircle2 className="h-4 w-4" />,
  };
  return (
    <button
      type="button"
      title={busy ? "Updating…" : `Status: ${TASK_STATUS_LABELS[status]} — click to advance`}
      aria-label={`Advance status (currently ${TASK_STATUS_LABELS[status]})`}
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      className={cn(
        "focus-ring mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
        styles[status]
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icons[status]}
    </button>
  );
}

function TaskRow({
  task, timeFormat, cycling, onOpen, onCycle,
}: {
  task: TaskItem;
  timeFormat: "12h" | "24h";
  cycling: boolean;
  onOpen: () => void;
  onCycle: () => void;
}) {
  const due = dueInfo(task, timeFormat);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="focus-ring group flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <StatusCircleButton status={task.status} onCycle={onCycle} busy={cycling} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("truncate text-sm font-medium text-foreground", task.status === "COMPLETED" && "text-muted-foreground line-through decoration-muted-foreground/60")}>
            {task.title}
          </p>
          {task.project ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-[1px] text-[10px] font-medium text-muted-foreground">{task.project}</span>
          ) : null}
          <PriorityBadge priority={task.priority} label={PRIORITY_LABELS[task.priority]} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
          {due ? (
            <span className={cn("inline-flex items-center gap-1 tabular", due.overdue && "font-semibold text-danger")}>
              <CalendarClock className={cn("h-3 w-3", due.overdue ? "text-danger" : "text-muted-foreground/70")} />
              {due.overdue ? `${due.text} · overdue` : due.text}
            </span>
          ) : null}
          <span>{task.assignedBy ? `Assigned by ${task.assignedBy}` : "Created by you"}</span>
          {task.status === "COMPLETED" && task.completedAt ? (
            <span className="tabular">Completed {fmtDateShort(task.completedAt)}</span>
          ) : null}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 max-w-xs flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", task.status === "COMPLETED" ? "bg-success" : "bg-primary")}
              style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-[10px] tabular text-muted-foreground">{task.progress}%</span>
        </div>
      </div>
      <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
    </div>
  );
}

// ── create / edit dialog ────────────────────────────────────
function TaskFormDialog({
  open, onOpenChange, editing, onDone, onRequestDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: TaskItem | null;
  onDone: () => void;
  onRequestDelete: (t: TaskItem) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [project, setProject] = useState(editing?.project ?? "");
  const [priority, setPriority] = useState<TaskPriority>(editing?.priority ?? "MEDIUM");
  const [status, setStatus] = useState<TaskStatus>(editing?.status ?? "TODO");
  const [dueLocal, setDueLocal] = useState(editing?.dueAt ? isoToDateTimeLocal(editing.dueAt) : "");
  const [progress, setProgress] = useState<number>(editing?.progress ?? 0);
  const [titleError, setTitleError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setProject("");
    setPriority("MEDIUM");
    setStatus("TODO");
    setDueLocal("");
    setProgress(0);
    setTitleError(null);
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<TaskItem>("/api/tasks", payload),
    onSuccess: (t) => {
      toast.success("Task created", { description: t.title });
      onOpenChange(false);
      onDone();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not create the task.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPatch<TaskItem>(`/api/tasks/${editing?.id}`, payload),
    onSuccess: (t) => {
      toast.success("Task updated", { description: t.title });
      onOpenChange(false);
      onDone();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not update the task.");
    },
  });

  const pending = createMutation.isPending || updateMutation.isPending;

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError("Title is required");
      return;
    }
    const dueAt = dateTimeLocalToIso(dueLocal);
    const payload: Record<string, unknown> = {
      title: trimmed,
      description: description.trim() ? description.trim() : null,
      project: project.trim() ? project.trim() : null,
      priority,
      dueAt,
      progress,
    };
    if (editing) {
      payload.status = status;
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scroll-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Task" : "New Task"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update details, status and progress." : "Add a work item to your personal task list."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(null); }}
              placeholder="e.g. Prepare monthly billing report"
              aria-invalid={!!titleError}
            />
            {titleError ? <p className="text-xs text-danger">{titleError}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-project">Project</Label>
              <Input
                id="task-project"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="e.g. Project Alpha"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Optional · time is IST</p>
            </div>
            {editing ? (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => {
                    const next = v as TaskStatus;
                    setStatus(next);
                    if (next === "COMPLETED") setProgress(100);
                    else if (status === "COMPLETED") setProgress(Math.min(90, progress));
                  }}
                >
                  <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{TASK_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="task-progress">Progress</Label>
              <span className="text-xs tabular text-muted-foreground">{progress}%</span>
            </div>
            <Slider
              value={[progress]}
              onValueChange={(v) => setProgress(v[0] ?? 0)}
              min={0}
              max={100}
              step={5}
              aria-label="Progress"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, links, acceptance criteria…"
              rows={3}
              className="text-xs"
            />
          </div>

          <DialogFooter className={cn("gap-2", editing?.status === "TODO" && "sm:justify-between")}>
            {editing?.status === "TODO" ? (
              <Button
                type="button"
                variant="outline"
                className="gap-1 border-danger/40 text-danger hover:bg-danger-soft hover:text-danger"
                onClick={() => onRequestDelete(editing)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : editing ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                {editing ? "Save Changes" : "Create Task"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
