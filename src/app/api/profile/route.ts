import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, badRequest, serverError, audit } from "@/lib/hrms/auth";
import { minutesBetween } from "@/lib/hrms/time";
import { z } from "zod";

export const dynamic = "force-dynamic";

const PHONE_RE = /^\+?[0-9][0-9\s\-]{7,14}$/;

const patchSchema = z.object({
  phone: z.string().trim().regex(PHONE_RE, "Enter a valid phone number (e.g. +91 98765 43210)").optional(),
  address: z.string().trim().min(4, "Address is too short").max(200).optional(),
  emergencyName: z.string().trim().min(2, "Enter the emergency contact name").max(60).optional(),
  emergencyPhone: z.string().trim().regex(PHONE_RE, "Enter a valid emergency phone number").optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
});

// Fields employees may never self-edit — payroll/HR owned data.
const RESTRICTED_FIELDS = new Set([
  "bankName", "bankAccount", "panNumber", "taxRegime",
  "designation", "department", "departmentId", "branch", "branchId",
  "employmentType", "dateOfJoining", "manager", "managerId", "companyId",
  "role", "status", "email", "firstName", "lastName", "empCode",
]);
const ALLOWED_FIELDS = new Set(["phone", "address", "emergencyName", "emergencyPhone", "skills"]);

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fallthrough */ }
  return [];
}

function maskAccount(acc: string | null): string | null {
  if (!acc) return null;
  const tail = acc.slice(-4);
  return `•••• •••• ${tail}`;
}

function maskPan(pan: string | null): string | null {
  if (!pan) return null;
  if (pan.length <= 4) return "••••";
  return `${pan.slice(0, 3)}••••••${pan.slice(-1)}`;
}

async function buildProfile(employeeId: string) {
  const e = await db.employee.findUnique({
    where: { id: employeeId },
    include: { department: true, branch: true, manager: true },
  });
  if (!e) return null;
  const now = new Date();
  return {
    empCode: e.empCode,
    role: e.role,
    personal: {
      firstName: e.firstName,
      lastName: e.lastName,
      name: `${e.firstName} ${e.lastName}`,
      dateOfBirth: e.dateOfBirth?.toISOString() ?? null,
      gender: e.gender,
      address: e.address,
    },
    employment: {
      designation: e.designation,
      department: e.department?.name ?? null,
      branch: e.branch ? `${e.branch.name}` : null,
      branchCity: e.branch?.city ?? null,
      managerName: e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : null,
      dateOfJoining: e.dateOfJoining.toISOString(),
      yearsOfService: Math.max(0, minutesBetween(e.dateOfJoining, now) / 60 / 24 / 365.25),
      employmentType: e.employmentType,
      status: e.status,
    },
    contact: {
      email: e.email,
      phone: e.phone,
      emergencyName: e.emergencyName,
      emergencyPhone: e.emergencyPhone,
    },
    bank: {
      bankName: e.bankName,
      bankAccountMasked: maskAccount(e.bankAccount),
      panNumberMasked: maskPan(e.panNumber),
      taxRegime: e.taxRegime,
    },
    skills: parseJsonArray(e.skills).filter((s): s is string => typeof s === "string"),
    education: parseJsonArray(e.education).filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null),
    experience: parseJsonArray(e.experience).filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null),
  };
}

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const profile = await buildProfile(auth.employee.id);
    if (!profile) return unauthorized();
    return ok(profile);
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;

    const body: unknown = await req.json().catch(() => null);
    if (typeof body !== "object" || body === null) {
      return badRequest("VALIDATION_ERROR", "Invalid request body.");
    }
    const fields = Object.keys(body as Record<string, unknown>);

    for (const key of fields) {
      if (RESTRICTED_FIELDS.has(key)) {
        return badRequest("RESTRICTED_FIELD", "Contact HR to change restricted fields");
      }
    }
    for (const key of fields) {
      if (!ALLOWED_FIELDS.has(key)) {
        return badRequest("VALIDATION_ERROR", `Field "${key}" cannot be updated from profile.`);
      }
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return badRequest("VALIDATION_ERROR", issue?.message ?? "Invalid values.");
    }

    const data: { phone?: string; address?: string; emergencyName?: string; emergencyPhone?: string; skills?: string } = {};
    if (parsed.data.phone !== undefined) data.phone = parsed.data.phone;
    if (parsed.data.address !== undefined) data.address = parsed.data.address;
    if (parsed.data.emergencyName !== undefined) data.emergencyName = parsed.data.emergencyName;
    if (parsed.data.emergencyPhone !== undefined) data.emergencyPhone = parsed.data.emergencyPhone;
    if (parsed.data.skills !== undefined) data.skills = JSON.stringify(parsed.data.skills);

    await db.employee.update({ where: { id: emp.id }, data });

    const changed = fields.join(", ");
    await audit(emp, "PROFILE_UPDATED", "Employee", emp.id, `Updated: ${changed || "none"}`);

    const profile = await buildProfile(emp.id);
    return ok({ profile });
  } catch (err) {
    return serverError(err);
  }
}
