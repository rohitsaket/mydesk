import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

interface DirectoryEmployee {
  id: string;
  empCode: string;
  firstName: string;
  lastName: string;
  name: string;
  designation: string;
  department: string | null;
  branchCity: string | null;
  email: string;
  phone: string | null;
  skills: string[];
  managerName: string | null;
}

function parseSkills(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string");
  } catch { /* fallthrough */ }
  return [];
}

export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const dept = (url.searchParams.get("dept") ?? "").trim();

    const companyId = emp.companyId;
    if (!companyId) return ok({ total: 0, employees: [], departments: [] });

    const [employees, departments] = await Promise.all([
      db.employee.findMany({
        where: { companyId, status: { not: "SEPARATED" } },
        include: { department: true, branch: true, manager: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      db.department.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
    ]);

    let filtered = employees;
    if (q) {
      filtered = filtered.filter((e) =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.empCode.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q)
      );
    }
    if (dept && dept !== "ALL") {
      filtered = filtered.filter((e) => e.department?.name === dept);
    }

    const items: DirectoryEmployee[] = filtered.map((e) => ({
      id: e.id,
      empCode: e.empCode,
      firstName: e.firstName,
      lastName: e.lastName,
      name: `${e.firstName} ${e.lastName}`,
      designation: e.designation,
      department: e.department?.name ?? null,
      branchCity: e.branch?.city ?? null,
      email: e.email,
      phone: e.phone,
      skills: parseSkills(e.skills),
      managerName: e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : null,
    }));

    return ok({
      total: items.length,
      employees: items,
      departments: departments.map((d) => ({ id: d.id, name: d.name })),
    });
  } catch (err) {
    return serverError(err);
  }
}
