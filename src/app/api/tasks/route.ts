import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, badRequest, serverError, audit } from "@/lib/hrms/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"] as const;
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  project: z.string().trim().max(100).optional().nullable(),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  status: z.literal("TODO").default("TODO"),
  dueAt: z.union([z.string(), z.null()]).optional(),
  progress: z.number().int().min(0).max(100).default(0),
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

export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    const q = url.searchParams.get("q")?.trim();

    if (status && !TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
      return badRequest("VALIDATION_ERROR", "Invalid status filter.");
    }
    if (priority && !TASK_PRIORITIES.includes(priority as (typeof TASK_PRIORITIES)[number])) {
      return badRequest("VALIDATION_ERROR", "Invalid priority filter.");
    }

    const tasks = await db.task.findMany({
      where: {
        employeeId: auth.employee.id,
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(q ? { title: { contains: q } } : {}),
      },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    });

    return ok({ items: tasks.map(serialize) });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid task payload.");
    }
    const data = parsed.data;

    let dueAt: Date | null = null;
    if (typeof data.dueAt === "string" && data.dueAt.trim()) {
      dueAt = new Date(data.dueAt);
      if (Number.isNaN(dueAt.getTime())) return badRequest("VALIDATION_ERROR", "Invalid due date.");
    }

    const task = await db.task.create({
      data: {
        employeeId: auth.employee.id,
        title: data.title,
        description: data.description ?? null,
        project: data.project?.trim() ? data.project : null,
        priority: data.priority,
        status: "TODO",
        dueAt,
        progress: Math.min(100, Math.max(0, data.progress)),
      },
    });

    await audit(auth.employee, "TASK_CREATED", "Task", task.id, task.title);
    return ok(serialize(task));
  } catch (err) {
    return serverError(err);
  }
}
