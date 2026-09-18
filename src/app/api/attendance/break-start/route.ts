import { getAuth, ok, unauthorized, badRequest, serverError, requestDeviceInfo, audit } from "@/lib/hrms/auth";
import { startBreak, buildAttendanceToday, AttendanceError } from "@/lib/hrms/attendance";
import { BREAK_TYPE_LABELS } from "@/lib/hrms/time";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID = ["TEA", "LUNCH", "PERSONAL", "PRAYER", "OFFICIAL", "CUSTOM"];

export async function POST(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const body = await req.json().catch(() => ({}));
    const breakType = typeof body?.breakType === "string" && VALID.includes(body.breakType) ? body.breakType : "TEA";
    const now = new Date();
    try {
      await startBreak(auth.employee, breakType, now);
      await audit(auth.employee, "ATTENDANCE_BREAK_START", "AttendanceEvent", undefined, `${BREAK_TYPE_LABELS[breakType] ?? breakType} started at ${now.toISOString()}`);
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
