import { getAuth, ok, unauthorized, badRequest, serverError, hasPermission, requestDeviceInfo, audit } from "@/lib/hrms/auth";
import { checkIn, buildAttendanceToday, AttendanceError } from "@/lib/hrms/attendance";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    if (!hasPermission(auth.employee.role, "attendance.punch")) {
      return badRequest("FORBIDDEN", "Check-in is not permitted for your account.");
    }
    const device = await requestDeviceInfo();
    const now = new Date();
    try {
      const result = await checkIn(auth.employee, "WEB", device, now);
      await audit(auth.employee, "ATTENDANCE_CHECK_IN", "AttendanceDay", result.day.id, `Checked in at ${now.toISOString()} via Web (${device})`);
      const payload = await buildAttendanceToday(auth.employee, now);
      return ok({ attendance: payload, checkedInAt: now.toISOString(), lateMinutes: result.lateMinutes });
    } catch (e) {
      if (e instanceof AttendanceError) {
        return badRequest(e.code, e.message);
      }
      throw e;
    }
  } catch (err) {
    return serverError(err);
  }
}
