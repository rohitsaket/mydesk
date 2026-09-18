import { db } from "@/lib/db";
import { createSession, verifyPassword, ok, badRequest, serverError, unauthorized } from "@/lib/hrms/auth";
import { buildEmployeeContext } from "@/lib/hrms/context";
import { z } from "zod";

const schema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return badRequest("VALIDATION_ERROR", "Email and password are required.");
    }
    const email = parsed.data.email.trim().toLowerCase();

    // allow employee ID login too
    let user = await db.user.findUnique({ where: { email }, include: { employee: true } });
    if (!user) {
      const emp = await db.employee.findUnique({ where: { empCode: email.toUpperCase() } });
      if (emp) user = await db.user.findUnique({ where: { employeeId: emp.id }, include: { employee: true } });
    }
    if (!user || !user.employee) {
      return unauthorized("Invalid email or password.");
    }
    if (!verifyPassword(parsed.data.password, user.passwordHash)) {
      return unauthorized("Invalid email or password.");
    }

    await createSession(user.id);
    await db.auditLog.create({
      data: {
        actorId: user.employee.id,
        actorName: `${user.employee.firstName} ${user.employee.lastName}`,
        action: "AUTH_LOGIN", entity: "User", entityId: user.id,
        details: "Signed in to My Desk",
      },
    });

    const context = await buildEmployeeContext(user.employee);
    return ok({ employee: context, theme: user.employee.theme });
  } catch (err) {
    return serverError(err);
  }
}
