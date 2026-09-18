import { z } from "zod";
import { db } from "@/lib/db";
import { getAuth, ok, badRequest, unauthorized, serverError, audit } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

const CATEGORIES = ["TRAVEL", "FOOD", "HOTEL", "FUEL", "CLIENT", "SUPPLIES", "OTHER"] as const;

const fieldsSchema = z.object({
  category: z.enum(CATEGORIES),
  expenseDate: z.string().min(8),
  amount: z.number().positive(),
  merchant: z.string().trim().max(120).optional(),
  project: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  receiptName: z.string().trim().max(200).optional(),
});

const createSchema = fieldsSchema;
const updateSchema = fieldsSchema.extend({ action: z.literal("update"), id: z.string().min(1) });
const submitSchema = z.object({ action: z.literal("submit"), id: z.string().min(1) });
const withdrawSchema = z.object({ action: z.literal("withdraw"), id: z.string().min(1) });

function parseDate(value: string): Date | null {
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function cleanText(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function mapExpense(e: {
  id: string; code: string; category: string; expenseDate: Date; amount: number;
  merchant: string | null; project: string | null; description: string | null; receiptName: string | null;
  status: string; submittedAt: Date | null; decidedAt: Date | null; decisionNote: string | null;
  paidAt: Date | null; createdAt: Date;
}) {
  return {
    id: e.id,
    code: e.code,
    category: e.category,
    expenseDate: e.expenseDate.toISOString(),
    amount: e.amount,
    merchant: e.merchant,
    project: e.project,
    description: e.description,
    receiptName: e.receiptName,
    status: e.status,
    submittedAt: e.submittedAt?.toISOString() ?? null,
    decidedAt: e.decidedAt?.toISOString() ?? null,
    decisionNote: e.decisionNote,
    paidAt: e.paidAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

const CLAIMED = ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED", "PAID"];
const PENDING = ["SUBMITTED", "MANAGER_APPROVED"];
const APPROVED = ["FINANCE_APPROVED"];
const REIMBURSED = ["PAID"];

/** GET /api/expenses?status= — own expenses (privacy) newest first + totals. */
export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const status = new URL(req.url).searchParams.get("status") ?? "ALL";

    let statusFilter: { in: string[] } | string | undefined;
    if (status === "ALL") statusFilter = undefined;
    else if (status === "REIMBURSED") statusFilter = { in: ["FINANCE_APPROVED", "PAID"] };
    else if (status === "APPROVED") statusFilter = { in: ["MANAGER_APPROVED", "FINANCE_APPROVED"] };
    else if (status === "PENDING") statusFilter = { in: PENDING };
    else statusFilter = status;

    const where = { employeeId: auth.employee.id, ...(statusFilter ? { status: statusFilter } : {}) };
    const [items, all] = await Promise.all([
      db.expense.findMany({ where, orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }] }),
      db.expense.findMany({ where: { employeeId: auth.employee.id } }),
    ]);

    const sum = (statuses: string[]) =>
      all.filter((e) => statuses.includes(e.status)).reduce((acc, e) => acc + e.amount, 0);

    return ok({
      items: items.map(mapExpense),
      totals: {
        claimed: sum(CLAIMED),
        pending: sum(PENDING),
        approved: sum(APPROVED),
        reimbursed: sum(REIMBURSED),
      },
    });
  } catch (err) {
    return serverError(err);
  }
}

/** POST /api/expenses — create draft | action submit | action withdraw | action update (draft only). */
export async function POST(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;
    const body: unknown = await req.json().catch(() => ({}));

    const submit = submitSchema.safeParse(body);
    if (submit.success) {
      const updated = await db.expense.updateMany({
        where: { id: submit.data.id, employeeId: emp.id, status: "DRAFT" },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });
      if (updated.count === 0) {
        return badRequest("INVALID_STATE", "Only your draft expenses can be submitted.");
      }
      const expense = await db.expense.findUnique({ where: { id: submit.data.id } });
      await audit(emp, "EXPENSE_SUBMITTED", "Expense", submit.data.id, `${expense?.code ?? ""} submitted for approval`);
      return ok({ expense: expense ? mapExpense(expense) : null });
    }

    const withdraw = withdrawSchema.safeParse(body);
    if (withdraw.success) {
      const updated = await db.expense.updateMany({
        where: { id: withdraw.data.id, employeeId: emp.id, status: "SUBMITTED" },
        data: { status: "CANCELLED" },
      });
      if (updated.count === 0) {
        return badRequest("INVALID_STATE", "Only submitted expenses awaiting approval can be withdrawn.");
      }
      const expense = await db.expense.findUnique({ where: { id: withdraw.data.id } });
      await audit(emp, "EXPENSE_WITHDRAWN", "Expense", withdraw.data.id, `${expense?.code ?? ""} withdrawn by employee`);
      return ok({ expense: expense ? mapExpense(expense) : null });
    }

    const update = updateSchema.safeParse(body);
    if (update.success) {
      const date = parseDate(update.data.expenseDate);
      if (!date) return badRequest("VALIDATION_ERROR", "Invalid expense date.");
      const existing = await db.expense.findFirst({
        where: { id: update.data.id, employeeId: emp.id, status: "DRAFT" },
      });
      if (!existing) {
        return badRequest("INVALID_STATE", "Only your draft expenses can be edited.");
      }
      const expense = await db.expense.update({
        where: { id: update.data.id },
        data: {
          category: update.data.category,
          expenseDate: date,
          amount: update.data.amount,
          merchant: cleanText(update.data.merchant),
          project: cleanText(update.data.project),
          description: cleanText(update.data.description),
          receiptName: cleanText(update.data.receiptName),
        },
      });
      await audit(emp, "EXPENSE_UPDATED", "Expense", expense.id, `${expense.code} draft updated`);
      return ok({ expense: mapExpense(expense) });
    }

    const create = createSchema.safeParse(body);
    if (!create.success) {
      const issue = create.error.issues[0]?.message ?? "Invalid expense details.";
      return badRequest("VALIDATION_ERROR", issue);
    }
    const date = parseDate(create.data.expenseDate);
    if (!date) return badRequest("VALIDATION_ERROR", "Invalid expense date.");

    // EX-5xx code: max existing numeric suffix + 1
    const existingCodes = await db.expense.findMany({ select: { code: true } });
    const maxNum = existingCodes.reduce((m, c) => {
      const n = Number.parseInt(c.code.replace("EX-", ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 500);

    const expense = await db.expense.create({
      data: {
        code: `EX-${maxNum + 1}`,
        employeeId: emp.id,
        category: create.data.category,
        expenseDate: date,
        amount: create.data.amount,
        merchant: cleanText(create.data.merchant),
        project: cleanText(create.data.project),
        description: cleanText(create.data.description),
        receiptName: cleanText(create.data.receiptName),
        status: "DRAFT",
      },
    });
    await audit(emp, "EXPENSE_CREATED", "Expense", expense.id, `${expense.code} draft created`);
    return ok({ expense: mapExpense(expense) });
  } catch (err) {
    return serverError(err);
  }
}
