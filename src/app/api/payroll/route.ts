import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

/** GET /api/payroll — own payroll overview (privacy: own payslips only). */
export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;

    const periods = await db.payrollPeriod.findMany({
      where: emp.companyId ? { companyId: emp.companyId } : {},
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    // Latest period = current cycle (seed keeps one PROCESSING + history)
    const current = periods[0] ?? null;

    const slips = await db.payslip.findMany({
      where: { employeeId: emp.id },
      include: { period: true },
    });
    const payslips = slips
      .sort((a, b) =>
        b.period.year - a.period.year ||
        b.period.month - a.period.month ||
        b.generatedAt.getTime() - a.generatedAt.getTime()
      )
      .map((s) => ({
        id: s.id,
        periodId: s.periodId,
        month: s.period.month,
        year: s.period.year,
        status: s.status,
        gross: s.gross,
        deductions: s.deductions,
        net: s.net,
        payableDays: s.payableDays,
        lopDays: s.lopDays,
        overtimeHours: s.overtimeHours,
        generatedAt: s.generatedAt.toISOString(),
      }));

    // Next pay date: earliest upcoming payDate, else most recent one
    const now = Date.now();
    const upcoming = periods
      .map((p) => p.payDate)
      .filter((d) => d.getTime() >= now)
      .sort((a, b) => a.getTime() - b.getTime());
    const latestPast = periods
      .map((p) => p.payDate)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const nextPayDate = upcoming[0] ?? latestPast ?? null;

    return ok({
      current: current
        ? {
            periodId: current.id,
            month: current.month,
            year: current.year,
            status: current.status,
            payDate: current.payDate.toISOString(),
          }
        : null,
      payslips,
      nextPayDate: nextPayDate ? nextPayDate.toISOString() : null,
      taxRegime: emp.taxRegime === "OLD" ? "OLD" : "NEW",
    });
  } catch (err) {
    return serverError(err);
  }
}
