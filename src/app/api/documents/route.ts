import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
/** Days before expiry where a document counts as "expiring soon". */
const WARN_WINDOW_DAYS = 30;

/** GET /api/documents — own documents + company-shared policies (privacy: own/shared only).
 *  Documents with an expiry date get a computed status: valid | expiring | expired. */
export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();

    const docs = await db.document.findMany({
      where: {
        OR: [{ employeeId: auth.employee.id }, { employeeId: null, sharedWithTeam: true }],
      },
      orderBy: { uploadedAt: "desc" },
    });

    const now = Date.now();
    let expiringCount = 0;
    let expiredCount = 0;

    const items = docs.map((d) => {
      let expiry: { status: "valid" | "expiring" | "expired"; daysLeft: number; date: string } | null = null;
      if (d.expiresAt) {
        const daysLeft = Math.ceil((d.expiresAt.getTime() - now) / DAY_MS);
        const status = daysLeft < 0 ? "expired" : daysLeft <= WARN_WINDOW_DAYS ? "expiring" : "valid";
        if (status === "expired") expiredCount += 1;
        else if (status === "expiring") expiringCount += 1;
        expiry = { status, daysLeft, date: d.expiresAt.toISOString() };
      }
      return {
        id: d.id,
        name: d.name,
        category: d.category,
        fileExt: d.fileExt,
        sizeKb: d.sizeKb,
        confidentiality: d.confidentiality,
        shared: d.employeeId === null && d.sharedWithTeam,
        uploadedAt: d.uploadedAt.toISOString(),
        expiry,
      };
    });

    return ok({
      items,
      summary: {
        total: items.length,
        withExpiry: expiringCount + expiredCount,
        expiring: expiringCount,
        expired: expiredCount,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
