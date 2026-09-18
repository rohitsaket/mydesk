import { z } from "zod";
import { db } from "@/lib/db";
import { getAuth, ok, badRequest, unauthorized, serverError, audit } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

const commentSchema = z.object({
  text: z.string().trim().min(1, "Comment cannot be empty.").max(1000),
});

const closeSchema = z.object({ action: z.literal("close") });

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
      if (typeof item.by !== "string" || typeof item.text !== "string" || typeof item.at !== "string") return [];
      return [{ by: item.by, at: item.at, text: item.text }];
    });
  } catch {
    return [];
  }
}

function mapTicket(t: {
  id: string; code: string; category: string; subject: string; description: string;
  priority: string; status: string; assignee: string | null; commentsJson: string;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: t.id,
    code: t.code,
    category: t.category,
    subject: t.subject,
    description: t.description,
    priority: t.priority,
    status: t.status,
    assignee: t.assignee,
    comments: parseComments(t.commentsJson),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function notFound() {
  return Response.json(
    { success: false, error: { code: "NOT_FOUND", message: "Ticket not found." } },
    { status: 404 }
  );
}

/** POST /api/hr-tickets/[id] — add a comment {text} or close a RESOLVED ticket {action:"close"}. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;
    const { id } = await params;
    const body: unknown = await req.json().catch(() => ({}));

    const ticket = await db.hrTicket.findUnique({ where: { id } });
    if (!ticket || ticket.employeeId !== emp.id) return notFound();

    const close = closeSchema.safeParse(body);
    if (close.success) {
      if (ticket.status !== "RESOLVED") {
        return badRequest("INVALID_STATE", "Only resolved tickets can be closed.");
      }
      const updated = await db.hrTicket.update({ where: { id }, data: { status: "CLOSED" } });
      await audit(emp, "HR_TICKET_CLOSED", "HrTicket", id, `${ticket.code} closed by employee`);
      return ok({ ticket: mapTicket(updated) });
    }

    const comment = commentSchema.safeParse(body);
    if (!comment.success) {
      const issue = comment.error.issues[0]?.message ?? "Invalid comment.";
      return badRequest("VALIDATION_ERROR", issue);
    }

    const existing = parseComments(ticket.commentsJson);
    const next = [...existing, { by: "You", at: new Date().toISOString(), text: comment.data.text }];
    const updated = await db.hrTicket.update({
      where: { id },
      data: { commentsJson: JSON.stringify(next), updatedAt: new Date() },
    });
    await audit(emp, "HR_TICKET_COMMENT", "HrTicket", id, `${ticket.code}: reply added`);
    return ok({ ticket: mapTicket(updated) });
  } catch (err) {
    return serverError(err);
  }
}
