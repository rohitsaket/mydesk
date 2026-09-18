import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, serverError, isManagerOrAbove } from "@/lib/hrms/auth";
import { buildEmployeeContext } from "@/lib/hrms/context";
import { buildAttendanceToday } from "@/lib/hrms/attendance";
import { dayIST, addDays, minutesBetween } from "@/lib/hrms/time";
import type {
  DeskPayload, WeeklyDay, MonthSummary, LeaveBalanceItem, UpcomingEvent,
  TeamMemberToday, ManagerWidgets,
} from "@/lib/hrms/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;
    const now = new Date();
    const today = dayIST(now);

    // parallel base data
    const [context, attendance] = await Promise.all([
      buildEmployeeContext(emp),
      buildAttendanceToday(emp, now),
    ]);

    // ── weekly hours (Mon..Sun of current week) ──
    const monday = addDays(today, -((today.getUTCDay() + 6) % 7));
    const weekDays = await db.attendanceDay.findMany({
      where: { employeeId: emp.id, date: { gte: monday, lte: addDays(monday, 6) } },
      orderBy: { date: "asc" },
    });
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weeklyDays: WeeklyDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const row = weekDays.find((w) => w.date.getTime() === d.getTime());
      const isToday = d.getTime() === today.getTime();
      const worked = row ? (isToday ? attendance.workedMinutes : row.netMinutes) : 0;
      const required = row?.requiredMinutes ?? (row?.status === "WO" ? 0 : 510);
      const isFuture = d.getTime() > today.getTime();
      weeklyDays.push({
        date: d.toISOString(),
        dayName: dayNames[d.getUTCDay()],
        requiredMinutes: required,
        workedMinutes: worked,
        overtimeMinutes: isToday ? attendance.overtimeMinutes : row?.overtimeMinutes ?? 0,
        shortageMinutes: isToday ? attendance.remainingMinutes : Math.max(0, (row?.requiredMinutes ?? 0) - (row?.netMinutes ?? 0)),
        status: row?.status ?? (isFuture ? "PENDING" : "A"),
        isToday,
        isFuture,
      });
    }
    const weeklyTotals = {
      requiredMinutes: weeklyDays.reduce((a, b) => a + (b.isFuture ? 0 : b.requiredMinutes), 0),
      workedMinutes: weeklyDays.reduce((a, b) => a + b.workedMinutes, 0),
      overtimeMinutes: weeklyDays.reduce((a, b) => a + b.overtimeMinutes, 0),
      shortfallMinutes: weeklyDays.reduce((a, b) => a + (b.isFuture ? 0 : Math.max(0, b.requiredMinutes - b.workedMinutes)), 0),
    };

    // ── month summary ──
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthDays = await db.attendanceDay.findMany({
      where: { employeeId: emp.id, date: { gte: monthStart, lte: addDays(today, 1) } },
    });
    let present = 0, absent = 0, leave = 0, halfDay = 0, late = 0, wfh = 0, od = 0, wo = 0, holiday = 0, mp = 0;
    let totalMinutes = 0, countedDays = 0, overtimeTotal = 0;
    for (const d of monthDays) {
      switch (d.status) {
        case "P": present++; if (d.lateMinutes > 0) late++; break;
        case "A": absent++; break;
        case "L": leave++; break;
        case "HD": halfDay++; break;
        case "WFH": wfh++; break;
        case "OD": od++; break;
        case "WO": wo++; break;
        case "H": holiday++; break;
        case "MP": mp++; break;
        default: break;
      }
      if (["P", "WFH", "OD", "HD"].includes(d.status)) {
        totalMinutes += d.netMinutes;
        countedDays++;
        overtimeTotal += d.overtimeMinutes;
      }
    }
    const month: MonthSummary = {
      present, absent, leave, halfDay, late, wfh, onDuty: od, weeklyOff: wo, holiday,
      missingPunch: mp, overtimeMinutes: overtimeTotal,
      averageMinutes: countedDays > 0 ? Math.round(totalMinutes / countedDays) : 0,
      payableDays: present + wfh + od + halfDay * 0.5 + holiday,
    };

    // ── leave balances ──
    const balances = await db.leaveBalance.findMany({
      where: { employeeId: emp.id, year: today.getUTCFullYear() },
      include: { leaveType: true },
      orderBy: { leaveTypeId: "asc" },
    });
    const leaveBalances: LeaveBalanceItem[] = balances.map((b) => ({
      leaveTypeId: b.leaveTypeId,
      name: b.leaveType.name,
      code: b.leaveType.code,
      color: b.leaveType.color,
      entitled: b.entitled,
      used: b.used,
      pending: b.pending,
      available: b.entitled - b.used - b.pending,
    }));

    // ── upcoming approved leave ──
    const upcomingLeaveReq = await db.leaveRequest.findFirst({
      where: { employeeId: emp.id, status: "APPROVED", fromDate: { gte: today } },
      include: { leaveType: true },
      orderBy: { fromDate: "asc" },
    });

    // ── tasks ──
    const tasks = await db.task.findMany({
      where: { employeeId: emp.id, status: { not: "COMPLETED" } },
      orderBy: [{ dueAt: "asc" }],
      take: 6,
    });
    const completedToday = await db.task.findMany({
      where: { employeeId: emp.id, status: "COMPLETED", completedAt: { gte: today } },
    });

    // ── upcoming events (7 days) ──
    const events = await db.calendarEvent.findMany({
      where: {
        OR: [
          { employeeId: emp.id },
          { companyId: emp.companyId, employeeId: null },
        ],
        startAt: { gte: addDays(today, -1), lte: addDays(today, 7) },
      },
      orderBy: { startAt: "asc" },
      take: 8,
    });
    const upcomingEvents: UpcomingEvent[] = events.map((e) => {
      const isToday = dayIST(e.startAt).getTime() === today.getTime();
      return {
        id: e.id, title: e.title, type: e.type,
        startAt: e.startAt.toISOString(), endAt: e.endAt?.toISOString() ?? null,
        allDay: e.allDay, location: e.location, isToday,
        timeLabel: e.allDay ? "All day" : "",
      };
    });

    // ── announcements ──
    const announcements = await db.announcement.findMany({
      where: { companyId: emp.companyId ?? "" },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 4,
    });
    const acks = await db.announcementAck.findMany({
      where: { employeeId: emp.id, announcementId: { in: announcements.map((a) => a.id) } },
    });

    // ── notifications ──
    const notifications = await db.notification.findMany({
      where: { employeeId: emp.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    // ── next holiday ──
    const nextHoliday = await db.holiday.findFirst({
      where: { companyId: emp.companyId ?? "", date: { gte: today } },
      orderBy: { date: "asc" },
    });

    // ── birthdays / anniversaries (this week) ──
    const peers = await db.employee.findMany({
      where: { companyId: emp.companyId, status: { in: ["ACTIVE", "PROBATION"] } },
    });
    const birthdays: DeskPayload["birthdays"] = [];
    for (const p of peers) {
      if (!p.dateOfBirth || !p.dateOfBirthPublic) continue;
      const bdThisYear = new Date(Date.UTC(today.getUTCFullYear(), p.dateOfBirth.getUTCMonth(), p.dateOfBirth.getUTCDate()));
      const diffDays = Math.round((bdThisYear.getTime() - today.getTime()) / 86400000);
      const isToday = diffDays === 0;
      if (diffDays >= 0 && diffDays <= 7) {
        birthdays.push({
          id: p.id, name: `${p.firstName} ${p.lastName}`, designation: p.designation,
          type: "BIRTHDAY",
          detail: isToday ? "is today 🎂" : diffDays === 1 ? "is tomorrow" : `in ${diffDays} days`,
          isToday,
        });
      }
      const joinDay = dayIST(p.dateOfJoining);
      const annThisYear = new Date(Date.UTC(today.getUTCFullYear(), joinDay.getUTCMonth(), joinDay.getUTCDate()));
      const years = today.getUTCFullYear() - p.dateOfJoining.getUTCFullYear();
      const diffAnn = Math.round((annThisYear.getTime() - today.getTime()) / 86400000);
      if (years >= 1 && diffAnn >= 0 && diffAnn <= 7) {
        birthdays.push({
          id: p.id, name: `${p.firstName} ${p.lastName}`, designation: p.designation,
          type: "ANNIVERSARY",
          detail: `${years}${["st", "nd", "rd"][years - 1] ?? "th"} work anniversary ${isToday ? "is today 🎉" : diffAnn === 1 ? "is tomorrow" : `in ${diffAnn} days`}`,
          isToday: diffAnn === 0,
        });
      }
    }
    birthdays.sort((a, b) => (a.isToday === b.isToday ? 0 : a.isToday ? -1 : 1));

    // ── assets ──
    const assets = await db.asset.findMany({ where: { employeeId: emp.id, status: "ASSIGNED" } });

    // ── warnings (missing punch yesterday, timesheet due, pending ack) ──
    const warnings: DeskPayload["warnings"] = [];
    const yesterday = addDays(today, -1);
    const yday = await db.attendanceDay.findUnique({
      where: { employeeId_date: { employeeId: emp.id, date: yesterday } },
    });
    if (yday && yday.status === "MP") {
      const hasPendingReg = await db.regularization.findFirst({
        where: { employeeId: emp.id, date: yesterday, status: "PENDING" },
      });
      if (!hasPendingReg) {
        warnings.push({
          id: "missing-punch-yesterday",
          title: "Missing checkout yesterday",
          message: "Yesterday's attendance is missing a checkout punch. Regularize it to avoid loss of pay.",
          link: "attendance",
        });
      }
    }
    const unacked = announcements.find(
      (a) => a.requiresAck && !acks.some((ack) => ack.announcementId === a.id)
    );
    if (unacked) {
      warnings.push({
        id: `ack-${unacked.id}`,
        title: "Action required: policy acknowledgement",
        message: unacked.title,
        link: "desk",
      });
    }

    // ── document expiry (expired or expiring within 30 days) ──
    const expiryHorizon = addDays(today, 30);
    const expiringDocs = await db.document.findMany({
      where: {
        employeeId: emp.id,
        expiresAt: { lte: expiryHorizon },
      },
      orderBy: { expiresAt: "asc" },
      take: 3,
    });
    if (expiringDocs.length > 0) {
      const expired = expiringDocs.filter((d) => d.expiresAt! <= today);
      const soon = expiringDocs.filter((d) => d.expiresAt! > today);
      const nearest = expiringDocs[0];
      const daysLeft = Math.ceil((nearest.expiresAt!.getTime() - today.getTime()) / 86_400_000);
      warnings.push({
        id: "document-expiry",
        tone: expired.length > 0 ? "danger" : "warning",
        title: expired.length > 0
          ? `${expired.length + soon.length} document${expired.length + soon.length === 1 ? "" : "s"} need${expired.length + soon.length === 1 ? "s" : ""} attention`
          : daysLeft === 0
            ? `${nearest.name} expires today`
            : `${nearest.name} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        message: expired.length > 0
          ? `${expired.length} expired (${expired.map((d) => d.name.split(" ")[0]).slice(0, 2).join(", ")})${soon.length > 0 ? ` · ${soon.length} expiring soon` : ""} — review and renew with HR.`
          : "Check the expiry date and renew with HR before it lapses.",
        link: "documents",
      });
    }

    // ── pending own requests counts ──
    const [pendLeave, pendWfh, pendOd, pendReg, pendTickets] = await Promise.all([
      db.leaveRequest.count({ where: { employeeId: emp.id, status: "PENDING" } }),
      db.dutyRequest.count({ where: { employeeId: emp.id, status: "PENDING" } }),
      db.dutyRequest.count({ where: { employeeId: emp.id, status: "PENDING" } }),
      db.regularization.count({ where: { employeeId: emp.id, status: "PENDING" } }),
      db.hrTicket.count({ where: { employeeId: emp.id, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    ]);

    // ── manager widgets ──
    let managerWidgets: ManagerWidgets | null = null;
    if (isManagerOrAbove(emp.role)) {
      const directReports = await db.employee.findMany({ where: { managerId: emp.id } });
      const reportIds = directReports.map((r) => r.id);
      let teamWorking = 0, teamBreak = 0, teamLeave = 0, teamWfh = 0, teamNotCheckedIn = 0, teamCheckedOut = 0;
      if (reportIds.length > 0) {
        const teamDays = await db.attendanceDay.findMany({
          where: { employeeId: { in: reportIds }, date: today },
        });
        for (const td of teamDays) {
          switch (td.status === "L" ? "L" : td.state) {
            case "WORKING": teamWorking++; break;
            case "ON_BREAK": teamBreak++; break;
            case "CHECKED_OUT": teamCheckedOut++; break;
            case "NOT_STARTED": {
              if (td.status === "L") teamLeave++;
              else if (td.status === "WFH") teamWfh++;
              else teamNotCheckedIn++;
              break;
            }
            default: break;
          }
        }
      }
      // pending approvals across request types where I am the manager
      const [apLeave, apWfh, apOd, apReg, apTimesheet, apExpense] = await Promise.all([
        db.leaveRequest.count({ where: { status: "PENDING", currentStage: "MANAGER", employee: { managerId: emp.id } } }),
        db.dutyRequest.count({ where: { status: "PENDING", type: "WFH", employee: { managerId: emp.id } } }),
        db.dutyRequest.count({ where: { status: "PENDING", type: "ON_DUTY", employee: { managerId: emp.id } } }),
        db.regularization.count({ where: { status: "PENDING", employee: { managerId: emp.id } } }),
        db.timesheetEntry.count({ where: { status: "SUBMITTED", employee: { managerId: emp.id } } }),
        db.expense.count({ where: { status: "SUBMITTED", employee: { managerId: emp.id } } }),
      ]);
      managerWidgets = {
        teamToday: {
          total: reportIds.length,
          working: teamWorking, onBreak: teamBreak, leave: teamLeave,
          wfh: teamWfh, notCheckedIn: teamNotCheckedIn, checkedOut: teamCheckedOut,
        },
        pendingApprovals: {
          leave: apLeave, wfh: apWfh, onDuty: apOd, attendance: apReg,
          timesheet: apTimesheet, expense: apExpense,
          total: apLeave + apWfh + apOd + apReg + apTimesheet + apExpense,
        },
      };
    }

    const payload: DeskPayload = {
      employee: {
        ...context,
        avatarInitials: `${emp.firstName.charAt(0)}${emp.lastName.charAt(0)}`.toUpperCase(),
        experienceYears: Math.max(0, Math.floor(minutesBetween(emp.dateOfJoining, now) / 60 / 24 / 365)),
      },
      attendance,
      summary: {
        shift: attendance.shift?.name ?? "General Shift",
        requiredMinutes: attendance.requiredMinutes,
        workedMinutes: attendance.workedMinutes,
        breakMinutes: attendance.breakMinutes,
        remainingMinutes: attendance.remainingMinutes,
        overtimeMinutes: attendance.overtimeMinutes,
      },
      weekly: { days: weeklyDays, totals: weeklyTotals },
      month,
      leaveBalances,
      upcomingLeave: upcomingLeaveReq ? {
        id: upcomingLeaveReq.id, code: upcomingLeaveReq.code,
        leaveType: upcomingLeaveReq.leaveType.name,
        fromDate: upcomingLeaveReq.fromDate.toISOString(),
        toDate: upcomingLeaveReq.toDate.toISOString(),
        days: upcomingLeaveReq.days, status: upcomingLeaveReq.status,
      } : null,
      tasks: tasks.map((t) => ({
        id: t.id, title: t.title, description: t.description, project: t.project,
        priority: t.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        status: t.status as "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED",
        dueAt: t.dueAt?.toISOString() ?? null, assignedBy: t.assignedBy, progress: t.progress,
      })),
      events: upcomingEvents,
      announcements: announcements.map((a) => ({
        id: a.id, title: a.title, body: a.body, level: a.level, category: a.category,
        priority: a.priority, requiresAck: a.requiresAck, pinned: a.pinned,
        publishedAt: a.publishedAt.toISOString(),
        acked: acks.some((ack) => ack.announcementId === a.id),
        acknowledged: 0,
      })),
      notifications: {
        unread: notifications.filter((n) => !n.read).length,
        items: notifications.slice(0, 6).map((n) => ({
          id: n.id, title: n.title, body: n.body, type: n.type,
          read: n.read, link: n.link, createdAt: n.createdAt.toISOString(),
        })),
      },
      nextHoliday: nextHoliday ? {
        id: nextHoliday.id, name: nextHoliday.name,
        date: nextHoliday.date.toISOString(), type: nextHoliday.type,
        daysRemaining: Math.round((nextHoliday.date.getTime() - today.getTime()) / 86400000),
      } : null,
      birthdays: birthdays.slice(0, 5),
      assets: assets.map((a) => ({ name: a.name, code: a.code })),
      warnings,
      managerWidgets,
      pendingRequests: {
        leave: pendLeave, wfh: pendWfh, onDuty: pendOd,
        regularizations: pendReg, tickets: pendTickets,
      },
    };

    return ok(payload);
  } catch (err) {
    return serverError(err);
  }
}
