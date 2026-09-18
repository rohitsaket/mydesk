import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, forbidden, serverError, isManagerOrAbove } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

const TABS = ["leave", "duty", "attendance", "timesheet", "expense"] as const;
type Tab = (typeof TABS)[number];

interface EmployeeBrief {
  id: string;
  empCode: string;
  name: string;
  designation: string;
}

function employeeBrief(e: { id: string; empCode: string; firstName: string; lastName: string; designation: string }): EmployeeBrief {
  return { id: e.id, empCode: e.empCode, name: `${e.firstName} ${e.lastName}`, designation: e.designation };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;
    if (!isManagerOrAbove(emp.role)) {
      return forbidden("Approvals inbox requires a manager role.");
    }

    const url = new URL(req.url);
    const rawTab = (url.searchParams.get("tab") ?? "leave").toLowerCase();
    const tab: Tab = (TABS as readonly string[]).includes(rawTab) ? (rawTab as Tab) : "leave";
    const isHR = emp.role === "HR" || emp.role === "ADMIN";
    const companyId = emp.companyId ?? "";

    // ── counts per tab (personalized: my reports + HR-stage queue for HR) ──
    // HR-gated queries use an impossible filter instead of conditional promises
    // so every branch returns the same shape.
    const noMatch = { id: "__none__" } as const;
    const [mgrLeave, hrLeave, duty, attendance, tsGroups, mgrExpense, hrFinanceApprove, hrPayable] = await Promise.all([
      db.leaveRequest.count({
        where: { status: "PENDING", currentStage: "MANAGER", employee: { managerId: emp.id } },
      }),
      db.leaveRequest.count({
        where: isHR
          ? { status: "PENDING", currentStage: "HR", employee: { companyId } }
          : noMatch,
      }),
      db.dutyRequest.count({
        where: { status: "PENDING", employee: { managerId: emp.id } },
      }),
      db.regularization.count({
        where: { status: "PENDING", employee: { managerId: emp.id } },
      }),
      db.timesheetEntry.groupBy({
        by: ["weekStart", "employeeId"],
        where: { status: "SUBMITTED", employee: { managerId: emp.id } },
      }),
      db.expense.count({
        where: { status: "SUBMITTED", employee: { managerId: emp.id } },
      }),
      db.expense.count({
        where: isHR ? { status: "MANAGER_APPROVED", employee: { companyId } } : noMatch,
      }),
      db.expense.count({
        where: isHR ? { status: "FINANCE_APPROVED", employee: { companyId } } : noMatch,
      }),
    ]);

    const counts = {
      leave: mgrLeave + hrLeave,
      duty,
      attendance,
      timesheet: tsGroups.length,
      expense: mgrExpense + hrFinanceApprove + hrPayable,
      total: mgrLeave + hrLeave + duty + attendance + tsGroups.length + mgrExpense + hrFinanceApprove + hrPayable,
    };

    // ── items for the requested tab ──
    if (tab === "leave") {
      const [mine, hrStage] = await Promise.all([
        db.leaveRequest.findMany({
          where: { status: "PENDING", currentStage: "MANAGER", employee: { managerId: emp.id } },
          include: { employee: true, leaveType: true, substitute: true },
          orderBy: { appliedAt: "asc" },
        }),
        db.leaveRequest.findMany({
          where: isHR
            ? { status: "PENDING", currentStage: "HR", employee: { companyId } }
            : noMatch,
          include: { employee: true, leaveType: true, substitute: true },
          orderBy: { appliedAt: "asc" },
        }),
      ]);
      const items = [
        ...mine.map((r) => ({ ...mapLeave(r), stage: "MANAGER" as const })),
        ...hrStage.map((r) => ({ ...mapLeave(r), stage: "HR" as const })),
      ];
      return ok({ tab, counts, items });
    }

    if (tab === "duty") {
      const rows = await db.dutyRequest.findMany({
        where: { status: "PENDING", employee: { managerId: emp.id } },
        include: { employee: true },
        orderBy: { appliedAt: "asc" },
      });
      const items = rows.map((r) => ({
        id: r.id,
        code: r.code,
        employee: employeeBrief(r.employee),
        type: r.type,
        subtype: r.subtype,
        fromDate: r.fromDate.toISOString(),
        toDate: r.toDate?.toISOString() ?? null,
        hours: r.hours,
        reason: r.reason,
        destination: r.destination,
        clientName: r.clientName,
        address: r.address,
        appliedAt: r.appliedAt.toISOString(),
      }));
      return ok({ tab, counts, items });
    }

    if (tab === "attendance") {
      const rows = await db.regularization.findMany({
        where: { status: "PENDING", employee: { managerId: emp.id } },
        include: { employee: true },
        orderBy: { appliedAt: "asc" },
      });
      const items = rows.map((r) => ({
        id: r.id,
        code: r.code,
        employee: employeeBrief(r.employee),
        date: r.date.toISOString(),
        currentCheckIn: r.currentCheckIn?.toISOString() ?? null,
        currentCheckOut: r.currentCheckOut?.toISOString() ?? null,
        requestedCheckIn: r.requestedCheckIn?.toISOString() ?? null,
        requestedCheckOut: r.requestedCheckOut?.toISOString() ?? null,
        reason: r.reason,
        appliedAt: r.appliedAt.toISOString(),
      }));
      return ok({ tab, counts, items });
    }

    if (tab === "timesheet") {
      const entries = await db.timesheetEntry.findMany({
        where: { status: "SUBMITTED", employee: { managerId: emp.id } },
        include: { employee: true },
        orderBy: [{ weekStart: "desc" }, { date: "asc" }],
      });
      const groupMap = new Map<string, {
        weekStart: string;
        employee: EmployeeBrief;
        entries: { id: string; date: string; project: string; taskName: string | null; description: string | null; minutes: number; billable: boolean }[];
        totalMinutes: number;
        billableMinutes: number;
      }>();
      for (const e of entries) {
        const key = `${e.weekStart.toISOString()}:${e.employeeId}`;
        let group = groupMap.get(key);
        if (!group) {
          group = {
            weekStart: e.weekStart.toISOString(),
            employee: employeeBrief(e.employee),
            entries: [],
            totalMinutes: 0,
            billableMinutes: 0,
          };
          groupMap.set(key, group);
        }
        group.entries.push({
          id: e.id,
          date: e.date.toISOString(),
          project: e.project,
          taskName: e.taskName,
          description: e.description,
          minutes: e.minutes,
          billable: e.billable,
        });
        group.totalMinutes += e.minutes;
        if (e.billable) group.billableMinutes += e.minutes;
      }
      const items = [...groupMap.values()];
      return ok({ tab, counts, items });
    }

    // tab === "expense"
    const [mine, finance, payable] = await Promise.all([
      db.expense.findMany({
        where: { status: "SUBMITTED", employee: { managerId: emp.id } },
        include: { employee: true },
        orderBy: { submittedAt: "asc" },
      }),
      db.expense.findMany({
        where: isHR ? { status: "MANAGER_APPROVED", employee: { companyId } } : noMatch,
        include: { employee: true },
        orderBy: { decidedAt: "asc" },
      }),
      db.expense.findMany({
        where: isHR ? { status: "FINANCE_APPROVED", employee: { companyId } } : noMatch,
        include: { employee: true },
        orderBy: { decidedAt: "asc" },
      }),
    ]);
    const items = [
      ...mine.map((x) => ({ ...mapExpense(x), stage: "MANAGER" as const })),
      ...finance.map((x) => ({ ...mapExpense(x), stage: "FINANCE" as const })),
      ...payable.map((x) => ({ ...mapExpense(x), stage: "PAY" as const })),
    ];
    return ok({ tab, counts, items });
  } catch (err) {
    return serverError(err);
  }
}

function mapLeave(r: {
  id: string; code: string; fromDate: Date; toDate: Date; dayMode: string; days: number;
  reason: string; contactDuringLeave: string | null; appliedAt: Date;
  employee: { id: string; empCode: string; firstName: string; lastName: string; designation: string };
  leaveType: { name: string; code: string; color: string };
  substitute: { firstName: string; lastName: string } | null;
}) {
  return {
    id: r.id,
    code: r.code,
    employee: employeeBrief(r.employee),
    leaveType: r.leaveType.name,
    leaveTypeCode: r.leaveType.code,
    leaveTypeColor: r.leaveType.color,
    fromDate: r.fromDate.toISOString(),
    toDate: r.toDate.toISOString(),
    dayMode: r.dayMode,
    days: r.days,
    reason: r.reason,
    contactDuringLeave: r.contactDuringLeave,
    substituteName: r.substitute ? `${r.substitute.firstName} ${r.substitute.lastName}` : null,
    appliedAt: r.appliedAt.toISOString(),
  };
}

function mapExpense(x: {
  id: string; code: string; category: string; expenseDate: Date; amount: number;
  currency: string; merchant: string | null; project: string | null; description: string | null;
  status: string; submittedAt: Date | null;
  employee: { id: string; empCode: string; firstName: string; lastName: string; designation: string };
}) {
  return {
    id: x.id,
    code: x.code,
    employee: employeeBrief(x.employee),
    category: x.category,
    expenseDate: x.expenseDate.toISOString(),
    amount: x.amount,
    currency: x.currency,
    merchant: x.merchant,
    project: x.project,
    description: x.description,
    status: x.status,
    submittedAt: x.submittedAt?.toISOString() ?? null,
  };
}
