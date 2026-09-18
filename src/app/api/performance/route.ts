import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

function goalProgress(current: number, target: number, unit: string): number {
  if (target <= 0) return 0;
  // "min" (and similar lower-is-better) units: progress improves as current drops toward target.
  const ratio = unit === "min" || unit === "mins" || unit === "minutes"
    ? target / Math.max(current, 0.0001)
    : current / target;
  return Math.max(0, Math.min(1, ratio));
}

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();

    const goals = await db.goal.findMany({
      where: { employeeId: auth.employee.id },
      orderBy: [{ quarter: "asc" }, { createdAt: "desc" }],
    });

    const items = goals.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      category: g.category,
      metric: g.metric,
      target: g.target,
      current: g.current,
      unit: g.unit,
      dueDate: g.dueDate?.toISOString() ?? null,
      status: g.status,
      quarter: g.quarter,
      progress: Math.round(goalProgress(g.current, g.target, g.unit) * 100),
    }));

    const active = items.filter((g) => g.status === "ACTIVE").length;
    const completed = items.filter((g) => g.status === "COMPLETED").length;
    const atRisk = items.filter((g) => g.status === "AT_RISK").length;
    const avgProgress = items.length
      ? Math.round(items.reduce((a, g) => a + g.progress, 0) / items.length)
      : 0;

    return ok({
      goals: items,
      summary: { active, completed, atRisk, avgProgress, total: items.length },
    });
  } catch (err) {
    return serverError(err);
  }
}
