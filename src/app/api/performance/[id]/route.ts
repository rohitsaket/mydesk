import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, badRequest, serverError, audit } from "@/lib/hrms/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  current: z.number().finite().min(0),
});

function notFound(message: string) {
  return Response.json({ success: false, error: { code: "NOT_FOUND", message } }, { status: 404 });
}

function goalProgress(current: number, target: number, unit: string): number {
  if (target <= 0) return 0;
  const ratio = unit === "min" || unit === "mins" || unit === "minutes"
    ? target / Math.max(current, 0.0001)
    : current / target;
  return Math.max(0, Math.min(1, ratio));
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("VALIDATION_ERROR", "Provide a numeric current value of at least 0.");
    }

    const { id } = await ctx.params;
    const goal = await db.goal.findUnique({ where: { id } });
    // Own goals only — never leak or mutate other employees' goals (IDOR guard).
    if (!goal || goal.employeeId !== emp.id) {
      return notFound("Goal not found.");
    }

    const clamped = Math.max(0, Math.min(parsed.data.current, goal.target));
    let status = goal.status;
    if (clamped >= goal.target) status = "COMPLETED";
    else if (goal.status === "COMPLETED") status = "ACTIVE";

    const updated = await db.goal.update({
      where: { id: goal.id },
      data: { current: clamped, status },
    });

    await audit(
      emp,
      "GOAL_PROGRESS_UPDATED",
      "Goal",
      goal.id,
      `${goal.title}: ${goal.current} → ${clamped} of ${goal.target} ${goal.unit} (status ${status})`
    );

    return ok({
      goal: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        category: updated.category,
        metric: updated.metric,
        target: updated.target,
        current: updated.current,
        unit: updated.unit,
        dueDate: updated.dueDate?.toISOString() ?? null,
        status: updated.status,
        quarter: updated.quarter,
        progress: Math.round(goalProgress(updated.current, updated.target, updated.unit) * 100),
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
