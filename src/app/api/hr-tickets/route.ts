import { z } from "zod";
import { db } from "@/lib/db";
import { getAuth, ok, badRequest, unauthorized, serverError, audit } from "@/lib/hrms/auth";
import { slaSummary, type SlaInput, SLA_TARGET_HOURS } from "@/lib/hrms/sla";

export const dynamic = "force-dynamic";

const CATEGORIES = ["HR", "IT", "FACILITIES", "PAYROLL", "ADMIN"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

const createSchema = z.object({
  category: z.enum(CATEGORIES),
  subject: z.string().trim().min(5, "Subject must be at least 5 characters."),
  description: z.string().trim().min(10, "Description must be at least 10 characters."),
  priority: z.enum(PRIORITIES),
});

const ASSIGNEE_BY_CATEGORY: Record<string, string> = {
  HR: "HR Operations",
  IT: "IT Support",
  FACILITIES: "Facilities",
  PAYROLL: "Payroll",
  ADMIN: "HR Operations",
};

interface TicketComment {
  by: string;
  at: string;
  text: string;
}

function parseComments(json: string): TicketComment[] {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((x): TicketComment[] => {
      if (typeof x !== "object" || x === null) return [];
      const item = x as Record<string, unknown>;
      if (typeof item.by !== "string" || typeof item.text !== "string") return [];
      if (typeof item.at !== "string") return [];
      return [{ by: item.by, at: item.at, text: item.text }];
    });
  } catch {
    return [];
  }
}

/** First non-employee comment = first response (ISO) or null while pending. */
function firstResponseOf(comments: TicketComment[]): string | null {
  const first = comments.find((c) => c.by !== "You");
  return first ? first.at : null;
}

function mapTicket(t: {
  id: string; code: string; category: string; subject: string; description: string;
  priority: string; status: string; assignee: string | null; commentsJson: string;
  createdAt: Date; updatedAt: Date;
}) {
  const comments = parseComments(t.commentsJson);
  const firstResponseAt = firstResponseOf(comments);
  return {
    id: t.id,
    code: t.code,
    category: t.category,
    subject: t.subject,
    description: t.description,
    priority: t.priority,
    status: t.status,
    assignee: t.assignee,
    comments,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    // SLA fields — client derives live state from these (no clock skew, live countdown)
    slaDueAt: new Date(t.createdAt.getTime() + (SLA_TARGET_HOURS[t.priority] ?? SLA_TARGET_HOURS.NORMAL) * 3600000).toISOString(),
    firstResponseAt,
  };
}

/** GET /api/hr-tickets — own tickets newest first. */
export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();

    const tickets = await db.hrTicket.findMany({
      where: { employeeId: auth.employee.id },
      orderBy: { createdAt: "desc" },
    });

    const items = tickets.map(mapTicket);
    const summary = slaSummary(
      items.map((t): SlaInput => ({ priority: t.priority, createdAt: t.createdAt, firstResponseAt: t.firstResponseAt }))
    );
    return ok({ items, summary });
  } catch (err) {
    return serverError(err);
  }
}

/** POST /api/hr-tickets — raise a new ticket (code HR-10xx, status OPEN). */
export async function POST(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;

    const body: unknown = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? "Invalid ticket details.";
      return badRequest("VALIDATION_ERROR", issue);
    }
    const { category, subject, description, priority } = parsed.data;

    // HR-10xx code: max existing numeric suffix + 1
    const existingCodes = await db.hrTicket.findMany({ select: { code: true } });
    const maxNum = existingCodes.reduce((m, c) => {
      const n = Number.parseInt(c.code.replace("HR-", ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 1000);

    const ticket = await db.hrTicket.create({
      data: {
        code: `HR-${maxNum + 1}`,
        employeeId: emp.id,
        category,
        subject,
        description,
        priority,
        status: "OPEN",
        assignee: ASSIGNEE_BY_CATEGORY[category] ?? "HR Operations",
      },
    });
    await audit(emp, "HR_TICKET_CREATED", "HrTicket", ticket.id, `${ticket.code} · ${subject}`);
    return ok({ ticket: mapTicket(ticket) });
  } catch (err) {
    return serverError(err);
  }
}
