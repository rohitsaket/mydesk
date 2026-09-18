import { db } from "@/lib/db";
import { getAuth, unauthorized, serverError, audit } from "@/lib/hrms/auth";
import { fmtDate } from "@/lib/hrms/time";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  APPOINTMENT: "Appointment",
  OFFER: "Offer Letter",
  ID: "ID",
  SALARY_REVISION: "Salary Revision",
  PAYSLIP: "Payslip",
  TAX: "Tax",
  POLICY: "Policy",
  CERTIFICATE: "Certificate",
  LETTER: "Letter",
};

function notFound() {
  return Response.json(
    { success: false, error: { code: "NOT_FOUND", message: "Document not found." } },
    { status: 404 }
  );
}

/** GET /api/documents/[id]/download — real downloadable text copy of the document metadata. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const { id } = await params;

    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) return notFound();

    // Privacy: own document, or a company-wide shared document
    const isOwn = doc.employeeId === auth.employee.id;
    const isShared = doc.employeeId === null && doc.sharedWithTeam;
    if (!isOwn && !isShared) return notFound();

    const emp = auth.employee;
    const issuedTo = isShared ? "All employees (company-wide)" : `${emp.firstName} ${emp.lastName} (${emp.empCode})`;
    const category = CATEGORY_LABELS[doc.category] ?? doc.category;
    const sizeLabel = doc.sizeKb >= 1024 ? `${(doc.sizeKb / 1024).toFixed(1)} MB` : `${doc.sizeKb} KB`;
    const line = "─".repeat(52);

    const content = [
      "MY DESK HRMS — DOCUMENT COPY",
      line,
      `Document       : ${doc.name}`,
      `Category       : ${category}`,
      `Issued to      : ${issuedTo}`,
      `Uploaded on    : ${fmtDate(doc.uploadedAt)}`,
      `Confidentiality: ${doc.confidentiality}`,
      `Source file    : ${doc.fileExt.toUpperCase()} · ${sizeLabel}`,
      isShared ? `Shared         : Company-wide policy` : `Shared         : No`,
      line,
      "",
      "This is a system-generated summary of the document record",
      "stored in My Desk HRMS. Original files are retained in the",
      "HR document vault; contact HR Operations for certified copies.",
      "",
      `Downloaded by  : ${emp.firstName} ${emp.lastName} (${emp.empCode})`,
      `Downloaded at  : ${fmtDate(new Date())}`,
    ].join("\n");

    const slug = doc.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "document";

    await audit(
      emp,
      "DOCUMENT_DOWNLOAD",
      "Document",
      doc.id,
      `Downloaded "${doc.name}"${doc.confidentiality === "SENSITIVE" ? " (sensitive)" : ""}`
    );

    return new Response(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.txt"`,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
