import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, badRequest, serverError } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const type = url.searchParams.get("type");

    const notifications = await db.notification.findMany({
      where: {
        employeeId: auth.employee.id,
        ...(unreadOnly ? { read: false } : {}),
        ...(type && type !== "ALL" ? { type } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const unread = await db.notification.count({ where: { employeeId: auth.employee.id, read: false } });

    return ok({
      items: notifications.map((n) => ({
        id: n.id, title: n.title, body: n.body, type: n.type,
        read: n.read, link: n.link, createdAt: n.createdAt.toISOString(),
      })),
      unread,
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
    const action = body?.action;

    if (action === "read-all") {
      await db.notification.updateMany({ where: { employeeId: auth.employee.id }, data: { read: true } });
      return ok({ updated: true });
    }
    if (action === "read" && typeof body?.id === "string") {
      await db.notification.updateMany({
        where: { id: body.id, employeeId: auth.employee.id },
        data: { read: true },
      });
      return ok({ updated: true });
    }
    return badRequest("VALIDATION_ERROR", "Invalid notification action.");
  } catch (err) {
    return serverError(err);
  }
}
