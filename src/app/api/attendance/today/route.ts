import { getAuth, ok, unauthorized, serverError, hasPermission, requestDeviceInfo, audit } from "@/lib/hrms/auth";
import { buildAttendanceToday, AttendanceError } from "@/lib/hrms/attendance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const payload = await buildAttendanceToday(auth.employee);
    return ok(payload);
  } catch (err) {
    return serverError(err);
  }
}

export { AttendanceError };
