import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError } from "@/lib/hrms/auth";
import { dayIST, addDays } from "@/lib/hrms/time";
import { resolveShiftForDay } from "@/lib/hrms/attendance";
import { parseHHMM } from "@/lib/hrms/time";

export const dynamic = "force-dynamic";

// ── GET: my shift details + upcoming 14-day roster ──────────
export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;

    const today = dayIST(new Date());
    const rangeEnd = addDays(today, 13);

    const [shift, assignments, genShift] = await Promise.all([
      resolveShiftForDay(emp.id, today),
      db.shiftAssignment.findMany({
        where: { employeeId: emp.id, date: { gte: today, lte: rangeEnd } },
        include: { shift: true },
      }),
      db.shift.findFirst({ where: { code: "GEN" } }),
    ]);

    const myShift = shift ?? genShift;
    const fallback = genShift;
    const assignmentMap = new Map(assignments.map((a) => [a.date.getTime(), a.shift]));

    type RosterDay = {
      date: string; shiftName: string; shiftCode: string; startTime: string;
      endTime: string; shiftType: string; isDefault: boolean;
    };
    const roster: RosterDay[] = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i);
      const s = assignmentMap.get(d.getTime()) ?? fallback;
      if (!s) break;
      roster.push({
        date: d.toISOString(),
        shiftName: s.name,
        shiftCode: s.code,
        startTime: s.startTime,
        endTime: s.endTime,
        shiftType: s.shiftType,
        isDefault: s.code === (fallback?.code ?? "GEN"),
      });
    }

    return ok({
      shift: myShift
        ? {
            id: myShift.id,
            name: myShift.name,
            code: myShift.code,
            startTime: myShift.startTime,
            endTime: myShift.endTime,
            shiftType: myShift.shiftType,
            graceMinutes: myShift.graceMinutes,
            breakAllowanceMinutes: myShift.breakAllowanceMinutes,
            requiredMinutes: myShift.requiredMinutes,
            weeklyOff: myShift.weeklyOff,
            description: myShift.description ?? null,
            crossesMidnight: parseHHMM(myShift.endTime) <= parseHHMM(myShift.startTime),
          }
        : null,
      roster,
    });
  } catch (err) {
    return serverError(err);
  }
}
