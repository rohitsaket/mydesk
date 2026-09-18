import { getAuth, ok, unauthorized, badRequest, serverError, requestDeviceInfo, audit } from "@/lib/hrms/auth";
import { checkOut, buildAttendanceToday, AttendanceError } from "@/lib/hrms/attendance";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;
    const device = await requestDeviceInfo();
    const now = new Date();
    try {
      const result = await checkOut(auth.employee, reason, "WEB", now);
      await audit(auth.employee, "ATTENDANCE_CHECK_OUT", "AttendanceDay", result.day.id, `Checked out at ${now.toISOString()}. Net ${result.net}m, break ${result.breakMinutes}m${reason ? `, reason: ${reason}` : ""}`);
      const payload = await buildAttendanceToday(auth.employee, now);
      return ok({ attendance: payload, summary: { net: result.net, gross: result.gross, breakMinutes: result.breakMinutes, required: result.required, remaining: result.remaining, overtime: result.overtime, earlyMinutes: result.earlyMinutes } });
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
