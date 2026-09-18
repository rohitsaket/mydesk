import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError, audit } from "@/lib/hrms/auth";
import { fmtINR } from "@/lib/hrms/time";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface PayslipLine {
  label: string;
  amount: number;
}

/** Parse earnings/deductions JSON with explicit narrowing (no any). */
function parseLines(json: string): PayslipLine[] {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((x): PayslipLine[] => {
      if (typeof x !== "object" || x === null) return [];
      const item = x as Record<string, unknown>;
      if (typeof item.label !== "string" || typeof item.amount !== "number") return [];
      return [{ label: item.label, amount: item.amount }];
    });
  } catch {
    return [];
  }
}

function notFound() {
  return Response.json(
    { success: false, error: { code: "NOT_FOUND", message: "Payslip not found." } },
    { status: 404 }
  );
}

/** GET /api/payroll/[id] — full payslip detail (own payslips only). ?download=1 → text attachment. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const { id } = await params;
    const download = new URL(req.url).searchParams.get("download") === "1";

    const slip = await db.payslip.findUnique({ where: { id }, include: { period: true } });
    if (!slip || slip.employeeId !== auth.employee.id) return notFound();

    const emp = auth.employee;
    const [department, company] = await Promise.all([
      emp.departmentId ? db.department.findUnique({ where: { id: emp.departmentId } }) : null,
      emp.companyId ? db.company.findUnique({ where: { id: emp.companyId } }) : null,
    ]);
    const companyName = company?.name ?? "NISS Technologies Pvt. Ltd.";

    const earnings = parseLines(slip.earningsJson);
    const deductionLines = parseLines(slip.deductionsJson);
    const monthLabel = `${MONTHS[slip.period.month - 1]} ${slip.period.year}`;

    if (download) {
      const line = "─".repeat(58);
      const pad = (label: string, value: string) => `${label.padEnd(26, " ")}${value}`;
      const rows = (items: PayslipLine[]) =>
        items.map((i) => pad(`  ${i.label}`, fmtINR(i.amount))).join("\n");

      const content = [
        "═".repeat(58),
        `  ${companyName.toUpperCase()}`,
        `  PAYSLIP — ${monthLabel.toUpperCase()}`,
        "═".repeat(58),
        "",
        pad("Employee", `${emp.firstName} ${emp.lastName}`),
        pad("Employee Code", emp.empCode),
        pad("Designation", emp.designation),
        pad("Department", department?.name ?? "—"),
        pad("Pay Period", monthLabel),
        pad("Pay Date", slip.period.payDate.toISOString().slice(0, 10)),
        pad("Payslip Status", slip.status),
        "",
        "EARNINGS",
        line,
        rows(earnings),
        `  ${pad("Gross Earnings", fmtINR(slip.gross))}`,
        "",
        "DEDUCTIONS",
        line,
        rows(deductionLines),
        `  ${pad("Total Deductions", fmtINR(slip.deductions))}`,
        "",
        line,
        `  ${pad("NET PAY", fmtINR(slip.net))}`,
        line,
        "",
        pad("Payable Days", String(slip.payableDays)),
        pad("LOP Days", String(slip.lopDays)),
        pad("Overtime Hours", `${slip.overtimeHours}h`),
        "",
        "Computer-generated payslip — My Desk HRMS",
      ].join("\n");

      const slug = `Payslip-${MONTHS[slip.period.month - 1]}-${slip.period.year}-${emp.empCode}`.toLowerCase();
      await audit(emp, "PAYSLIP_DOWNLOAD", "Payslip", slip.id, `Downloaded payslip ${monthLabel}`);
      return new Response(content, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${slug}.txt"`,
        },
      });
    }

    return ok({
      payslip: {
        id: slip.id,
        month: slip.period.month,
        year: slip.period.year,
        status: slip.status,
        gross: slip.gross,
        deductions: slip.deductions,
        net: slip.net,
        payableDays: slip.payableDays,
        lopDays: slip.lopDays,
        overtimeHours: slip.overtimeHours,
        earnings,
        deductionLines,
        generatedAt: slip.generatedAt.toISOString(),
      },
      period: {
        month: slip.period.month,
        year: slip.period.year,
        status: slip.period.status,
        payDate: slip.period.payDate.toISOString(),
      },
      employee: {
        name: `${emp.firstName} ${emp.lastName}`,
        empCode: emp.empCode,
        designation: emp.designation,
        department: department?.name ?? "—",
        company: companyName,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
