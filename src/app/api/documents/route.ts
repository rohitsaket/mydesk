import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

/** GET /api/documents — own documents + company-shared policies (privacy: own/shared only). */
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

    return ok({
      items: docs.map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        fileExt: d.fileExt,
        sizeKb: d.sizeKb,
        confidentiality: d.confidentiality,
        shared: d.employeeId === null && d.sharedWithTeam,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
    });
  } catch (err) {
    return serverError(err);
  }
}
