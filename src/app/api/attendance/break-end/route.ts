import { getAuth, ok, unauthorized, badRequest, serverError, audit } from "@/lib/hrms/auth";
import { endBreak, buildAttendanceToday, AttendanceError } from "@/lib/hrms/attendance";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const now = new Date();
    try {
      await endBreak(auth.employee, now);
      await audit(auth.employee, "ATTENDANCE_BREAK_END", "AttendanceEvent", undefined, `Break ended at ${now.toISOString()}`);
      const payload = await buildAttendanceToday(auth.employee, now);
      return ok({ attendance: payload });
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
