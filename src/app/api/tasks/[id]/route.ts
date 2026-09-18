import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, badRequest, serverError, audit } from "@/lib/hrms/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"] as const;
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  project: z.string().trim().max(100).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueAt: z.union([z.string(), z.null()]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

function serialize(t: {
  id: string; title: string; description: string | null; project: string | null;
  priority: string; status: string; dueAt: Date | null; assignedBy: string | null;
  progress: number; completedAt: Date | null; createdAt: Date;
}) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    project: t.project,
    priority: t.priority,
    status: t.status,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    assignedBy: t.assignedBy,
    progress: t.progress,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const { id } = await params;

    const task = await db.task.findFirst({ where: { id, employeeId: auth.employee.id } });
    if (!task) return badRequest("NOT_FOUND", "Task not found.");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid task payload.");
    }
    const data = parsed.data;

    const updates: Record<string, unknown> = {};

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.project !== undefined) updates.project = data.project?.trim() ? data.project : null;
    if (data.priority !== undefined) updates.priority = data.priority;

    if (data.dueAt !== undefined) {
      if (typeof data.dueAt === "string" && data.dueAt.trim()) {
        const dueAt = new Date(data.dueAt);
        if (Number.isNaN(dueAt.getTime())) return badRequest("VALIDATION_ERROR", "Invalid due date.");
        updates.dueAt = dueAt;
      } else {
        updates.dueAt = null;
      }
    }

    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === "COMPLETED") {
        updates.completedAt = new Date();
        updates.progress = 100;
      } else if (task.status === "COMPLETED") {
        // moved out of completed — clear the completion stamp
        updates.completedAt = null;
        if (data.progress === undefined) updates.progress = Math.min(task.progress, 90);
      }
    }

    if (data.progress !== undefined) {
      updates.progress = data.progress;
      if (data.progress === 100 && data.status === undefined && task.status !== "COMPLETED") {
        updates.status = "COMPLETED";
        updates.completedAt = new Date();
      }
    }

    const updated = await db.task.update({ where: { id: task.id }, data: updates });
    await audit(
      auth.employee,
      data.status !== undefined && data.status !== task.status ? "TASK_STATUS_UPDATED" : "TASK_UPDATED",
      "Task",
      updated.id,
      `${updated.title} → ${updated.status}`
    );
    return ok(serialize(updated));
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const { id } = await params;

    const task = await db.task.findFirst({ where: { id, employeeId: auth.employee.id } });
    if (!task) return badRequest("NOT_FOUND", "Task not found.");
    if (task.status !== "TODO") {
      return badRequest("TASK_NOT_DELETABLE", "Only tasks in To Do status can be deleted.");
    }

    await db.task.delete({ where: { id: task.id } });
    await audit(auth.employee, "TASK_DELETED", "Task", task.id, task.title);
    return ok({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
