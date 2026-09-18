import { getAuth, ok, unauthorized } from "@/lib/hrms/auth";
import { buildEmployeeContext } from "@/lib/hrms/context";

export async function GET() {
  const auth = await getAuth();
  if (!auth) return unauthorized();
  const context = await buildEmployeeContext(auth.employee);
  return ok({ employee: context, theme: auth.employee.theme, timeFormat: auth.employee.timeFormat });
}
