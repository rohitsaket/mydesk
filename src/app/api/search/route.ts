import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError } from "@/lib/hrms/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (q.length < 2) return ok({ employees: [], pages: [], requests: [], tasks: [] });

    // employees (scoped to company; directory permission implied for all employees)
    const employees = await db.employee.findMany({
      where: {
        companyId: auth.employee.companyId,
        OR: [
          { firstName: { contains: q } }, { lastName: { contains: q } },
          { email: { contains: q } }, { empCode: { contains: q.toUpperCase() } },
          { designation: { contains: q } },
        ],
      },
      include: { department: true },
      take: 6,
    });

    // own tasks
    const tasks = await db.task.findMany({
      where: { employeeId: auth.employee.id, title: { contains: q } },
      take: 5,
    });

    // own requests (leave + duty)
    const leaveReqs = await db.leaveRequest.findMany({
      where: { employeeId: auth.employee.id, OR: [{ code: { contains: q.toUpperCase() } }, { reason: { contains: q } }] },
      include: { leaveType: true },
      take: 4,
    });
    const dutyReqs = await db.dutyRequest.findMany({
      where: { employeeId: auth.employee.id, OR: [{ code: { contains: q.toUpperCase() } }, { reason: { contains: q } }] },
      take: 4,
    });

    return ok({
      employees: employees.map((e) => ({
        id: e.id, name: `${e.firstName} ${e.lastName}`, designation: e.designation,
        department: e.department?.name ?? "—", empCode: e.empCode,
      })),
      pages: [] as string[],
      requests: [
        ...leaveReqs.map((r) => ({ id: r.id, code: r.code, kind: "Leave", detail: `${r.leaveType.name} · ${r.status}` })),
        ...dutyReqs.map((r) => ({ id: r.id, code: r.code, kind: r.type === "WFH" ? "WFH" : "On Duty", detail: r.status })),
      ],
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    });
  } catch (err) {
    return serverError(err);
  }
}
