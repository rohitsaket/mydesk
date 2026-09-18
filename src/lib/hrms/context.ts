import { db } from "@/lib/db";
import type { Employee } from "@prisma/client";
import type { EmployeeContext } from "./types";

export async function buildEmployeeContext(employee: Employee): Promise<EmployeeContext> {
  const [department, branch, company, manager] = await Promise.all([
    employee.departmentId ? db.department.findUnique({ where: { id: employee.departmentId } }) : null,
    employee.branchId ? db.branch.findUnique({ where: { id: employee.branchId } }) : null,
    employee.companyId ? db.company.findUnique({ where: { id: employee.companyId } }) : null,
    employee.managerId ? db.employee.findUnique({ where: { id: employee.managerId } }) : null,
  ]);

  return {
    id: employee.id,
    empCode: employee.empCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    fullName: `${employee.firstName} ${employee.lastName}`,
    email: employee.email,
    phone: employee.phone,
    designation: employee.designation,
    role: employee.role as EmployeeContext["role"],
    status: employee.status,
    department: department?.name ?? null,
    departmentId: employee.departmentId,
    branch: branch ? `${branch.name}, ${branch.city}` : null,
    companyId: employee.companyId,
    companyName: company?.name ?? null,
    managerName: manager ? `${manager.firstName} ${manager.lastName}` : null,
    managerId: employee.managerId,
    dateOfJoining: employee.dateOfJoining.toISOString(),
    dateOfBirth: employee.dateOfBirth?.toISOString() ?? null,
    skills: JSON.parse(employee.skills || "[]") as string[],
  };
}
