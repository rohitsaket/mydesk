import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, badRequest, serverError, audit } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const companyId = auth.employee.companyId;
    if (!companyId) return ok({ items: [] });

    const announcements = await db.announcement.findMany({
      where: { companyId },
      orderBy: [{ priority: "desc" }, { publishedAt: "desc" }],
      take: 50,
    });
    const acks = await db.announcementAck.findMany({
      where: { employeeId: auth.employee.id, announcementId: { in: announcements.map((a) => a.id) } },
    });

    return ok({
      items: announcements.map((a) => {
        const ackCount = db.announcementAck.count({ where: { announcementId: a.id } });
        return {
          id: a.id, title: a.title, body: a.body, level: a.level, category: a.category,
          priority: a.priority, requiresAck: a.requiresAck,
          publishedAt: a.publishedAt.toISOString(),
          acked: acks.some((k) => k.announcementId === a.id),
          acknowledged: 0,
        };
      }),
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
