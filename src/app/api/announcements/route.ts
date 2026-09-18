import { z } from "zod";
import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, forbidden, badRequest, serverError, audit } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

const composeSchema = z.object({
  action: z.literal("compose"),
  title: z.string().trim().min(5, "Title must be at least 5 characters").max(120, "Title must be under 120 characters"),
  body: z.string().trim().min(10, "Body must be at least 10 characters").max(2000, "Body must be under 2000 characters"),
  level: z.enum(["COMPANY", "BRANCH", "DEPARTMENT", "EMPLOYEE"]).default("COMPANY"),
  category: z.enum(["GENERAL", "POLICY", "EVENT", "HOLIDAY", "BENEFITS"]).default("GENERAL"),
  priority: z.enum(["NORMAL", "IMPORTANT", "CRITICAL"]).default("NORMAL"),
  requiresAck: z.boolean().default(false),
  pinned: z.boolean().default(false),
});

// Priority rank for correct feed ordering (CRITICAL > IMPORTANT > NORMAL).
// Prisma can't rank by semantic order, so we sort in memory after the fetch.
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 3, IMPORTANT: 2, NORMAL: 1 };

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const companyId = auth.employee.companyId;
    if (!companyId) return ok({ items: [] });

    const announcements = await db.announcement.findMany({
      where: { companyId },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 50,
    });
    announcements.sort(
      (a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
        (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0) ||
        b.publishedAt.getTime() - a.publishedAt.getTime(),
    );
    const acks = await db.announcementAck.findMany({
      where: { employeeId: auth.employee.id, announcementId: { in: announcements.map((a) => a.id) } },
    });
    const ackCounts = await Promise.all(
      announcements.map((a) => db.announcementAck.count({ where: { announcementId: a.id } })),
    );

    return ok({
      items: announcements.map((a, i) => ({
        id: a.id, title: a.title, body: a.body, level: a.level, category: a.category,
        priority: a.priority, requiresAck: a.requiresAck, pinned: a.pinned,
        publishedAt: a.publishedAt.toISOString(),
        acked: acks.some((k) => k.announcementId === a.id),
        acknowledged: ackCounts[i] ?? 0,
      })),
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const body = await req.json().catch(() => ({}));

    // ── compose: publish a new announcement (HR / Admin only) ──
    if (body?.action === "compose") {
      const role = auth.employee.role;
      if (role !== "HR" && role !== "ADMIN") {
        return forbidden("Only HR and Admin can publish announcements.");
      }
      const parsed = composeSchema.safeParse(body);
      if (!parsed.success) {
        return badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid announcement.");
      }
      const companyId = auth.employee.companyId;
      if (!companyId) return badRequest("NO_COMPANY", "Your account is not linked to a company.");
      const { title, body: text, level, category, priority, requiresAck, pinned } = parsed.data;
      const created = await db.announcement.create({
        data: { companyId, title, body: text, level, category, priority, requiresAck, pinned },
      });
      await audit(auth.employee, "ANNOUNCEMENT_PUBLISHED", "Announcement", created.id, title);
      return ok({
        item: {
          id: created.id, title: created.title, body: created.body, level: created.level,
          category: created.category, priority: created.priority, requiresAck: created.requiresAck,
          pinned: created.pinned,
          publishedAt: created.publishedAt.toISOString(), acked: false, acknowledged: 0,
        },
      });
    }

    // ── delete: remove an announcement (HR / Admin only) ──
    if (body?.action === "delete" && typeof body?.id === "string") {
      const role = auth.employee.role;
      if (role !== "HR" && role !== "ADMIN") {
        return forbidden("Only HR and Admin can remove announcements.");
      }
      const announcement = await db.announcement.findFirst({
        where: { id: body.id, companyId: auth.employee.companyId ?? "" },
      });
      if (!announcement) return badRequest("NOT_FOUND", "Announcement not found.");
      await db.announcement.delete({ where: { id: announcement.id } });
      await audit(auth.employee, "ANNOUNCEMENT_DELETED", "Announcement", announcement.id, announcement.title);
      return ok({ deleted: true });
    }

    // ── pin / unpin: toggle top-of-feed placement (HR / Admin only) ──
    if ((body?.action === "pin" || body?.action === "unpin") && typeof body?.id === "string") {
      const role = auth.employee.role;
      if (role !== "HR" && role !== "ADMIN") {
        return forbidden("Only HR and Admin can pin announcements.");
      }
      const announcement = await db.announcement.findFirst({
        where: { id: body.id, companyId: auth.employee.companyId ?? "" },
      });
      if (!announcement) return badRequest("NOT_FOUND", "Announcement not found.");
      const pinned = body.action === "pin";
      await db.announcement.update({ where: { id: announcement.id }, data: { pinned } });
      await audit(
        auth.employee,
        pinned ? "ANNOUNCEMENT_PINNED" : "ANNOUNCEMENT_UNPINNED",
        "Announcement",
        announcement.id,
        announcement.title,
      );
      return ok({ pinned });
    }

    if (body?.action === "ack" && typeof body?.id === "string") {
      const announcement = await db.announcement.findFirst({
        where: { id: body.id, companyId: auth.employee.companyId ?? "" },
      });
      if (!announcement) return badRequest("NOT_FOUND", "Announcement not found.");
      if (!announcement.requiresAck) return badRequest("NOT_REQUIRED", "This announcement does not require acknowledgement.");

      await db.announcementAck.upsert({
        where: { announcementId_employeeId: { announcementId: announcement.id, employeeId: auth.employee.id } },
        create: { announcementId: announcement.id, employeeId: auth.employee.id },
        update: { ackedAt: new Date() },
      });
      await audit(auth.employee, "ANNOUNCEMENT_ACKNOWLEDGED", "Announcement", announcement.id, announcement.title);
      return ok({ acked: true });
    }
    return badRequest("VALIDATION_ERROR", "Invalid announcement action.");
  } catch (err) {
    return serverError(err);
  }
}
