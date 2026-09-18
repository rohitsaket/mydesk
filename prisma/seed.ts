/**
 * My Desk HRMS — realistic development seed data.
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "node:crypto";

const db = new PrismaClient();

// ── deterministic PRNG ────────────────────────────────────────
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260918);
const ri = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

// ── password hashing ──────────────────────────────────────────
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

// ── IST time helpers (org timezone: Asia/Calcutta, fixed +5:30) ─
const IST_OFFSET_MS = 330 * 60 * 1000;
function todayIST(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Calcutta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function ist(day: Date, h: number, m: number): Date {
  return new Date(day.getTime() + h * 3600000 + m * 60000 - IST_OFFSET_MS);
}
function addDays(day: Date, n: number): Date {
  return new Date(day.getTime() + n * 86400000);
}
function dow(day: Date): number { return day.getUTCDay(); } // 0=Sun

async function main() {
  console.log("Seeding My Desk HRMS…");

  // wipe (dependency order)
  await db.auditLog.deleteMany();
  await db.announcementAck.deleteMany();
  await db.announcement.deleteMany();
  await db.notification.deleteMany();
  await db.goal.deleteMany();
  await db.asset.deleteMany();
  await db.hrTicket.deleteMany();
  await db.document.deleteMany();
  await db.expense.deleteMany();
  await db.payslip.deleteMany();
  await db.payrollPeriod.deleteMany();
  await db.timesheetEntry.deleteMany();
  await db.calendarEvent.deleteMany();
  await db.holiday.deleteMany();
  await db.task.deleteMany();
  await db.regularization.deleteMany();
  await db.dutyRequest.deleteMany();
  await db.leaveRequest.deleteMany();
  await db.leaveBalance.deleteMany();
  await db.leaveType.deleteMany();
  await db.attendanceEvent.deleteMany();
  await db.attendanceDay.deleteMany();
  await db.shiftAssignment.deleteMany();
  await db.shift.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.employee.deleteMany();
  await db.department.deleteMany();
  await db.branch.deleteMany();
  await db.company.deleteMany();

  const today = todayIST();
  const now = new Date();

  // ── organization ────────────────────────────────────────────
  const company = await db.company.create({
    data: { name: "NISS Technologies Pvt. Ltd.", code: "NISS", timezone: "Asia/Calcutta" },
  });
  const branchHQ = await db.branch.create({ data: { name: "Surat Head Office", city: "Surat", companyId: company.id } });
  const branchAmd = await db.branch.create({ data: { name: "Ahmedabad Branch", city: "Ahmedabad", companyId: company.id } });
  const branchBom = await db.branch.create({ data: { name: "Mumbai Branch", city: "Mumbai", companyId: company.id } });

  const dept = async (name: string) =>
    (await db.department.create({ data: { name, companyId: company.id } })).id;
  const dTech = await dept("Technology");
  const dHR = await dept("Human Resources");
  const dFin = await dept("Finance");
  const dSales = await dept("Sales");
  const dOps = await dept("Operations");

  // ── shifts ──────────────────────────────────────────────────
  const shiftGEN = await db.shift.create({ data: {
    name: "General Shift", code: "GEN", startTime: "09:30", endTime: "18:30",
    shiftType: "FIXED", graceMinutes: 15, breakAllowanceMinutes: 60,
    requiredMinutes: 510, weeklyOff: "0", description: "Standard day shift 09:30–18:30",
  } });
  const shiftEVE = await db.shift.create({ data: {
    name: "Evening Shift", code: "EVE", startTime: "14:00", endTime: "23:00",
    shiftType: "ROTATIONAL", graceMinutes: 10, breakAllowanceMinutes: 45,
    requiredMinutes: 510, weeklyOff: "0",
  } });
  const shiftNIGHT = await db.shift.create({ data: {
    name: "Night Shift", code: "NGT", startTime: "22:00", endTime: "07:00",
    shiftType: "NIGHT", graceMinutes: 15, breakAllowanceMinutes: 45,
    requiredMinutes: 540, weeklyOff: "0", description: "Overnight shift crossing midnight",
  } });

  // ── leave types ─────────────────────────────────────────────
  const ltCL = await db.leaveType.create({ data: { name: "Casual Leave", code: "CL", annualQuota: 12, color: "#2563EB" } });
  const ltSL = await db.leaveType.create({ data: { name: "Sick Leave", code: "SL", annualQuota: 8, color: "#F04438" } });
  const ltEL = await db.leaveType.create({ data: { name: "Earned Leave", code: "EL", annualQuota: 15, carryForward: true, color: "#12B76A" } });
  const ltCO = await db.leaveType.create({ data: { name: "Compensatory Off", code: "COMP", annualQuota: 6, color: "#F79009" } });

  // ── employees ───────────────────────────────────────────────
  interface EmpSpec {
    code: string; first: string; last: string; designation: string; dept: string;
    branch: { id: string }; role: "EMPLOYEE" | "MANAGER" | "HR" | "ADMIN"; shift: string;
    dojYears: number; gross: number; dobMonth: number; dobDay: number;
    probation?: boolean; notice?: boolean; skills: string[];
  }
  const year = today.getUTCFullYear();
  const specs: EmpSpec[] = [
    { code: "NISS001", first: "Rohit", last: "Patel", designation: "Senior Developer", dept: dTech, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 4.2, gross: 85000, dobMonth: 11, dobDay: 14, skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "AWS"] },
    { code: "NISS002", first: "Anita", last: "Desai", designation: "Engineering Manager", dept: dTech, branch: branchHQ, role: "MANAGER", shift: "GEN", dojYears: 8.1, gross: 142000, dobMonth: 3, dobDay: 22, skills: ["Leadership", "Agile", "Architecture"] },
    { code: "NISS003", first: "Payal", last: "Mehta", designation: "HR Manager", dept: dHR, branch: branchHQ, role: "HR", shift: "GEN", dojYears: 6.4, gross: 128000, dobMonth: 7, dobDay: 9, skills: ["HR Operations", "Payroll", "Compliance"] },
    { code: "NISS004", first: "Vikram", last: "Shah", designation: "Head of IT & Systems", dept: dOps, branch: branchHQ, role: "ADMIN", shift: "GEN", dojYears: 9.0, gross: 155000, dobMonth: 1, dobDay: 5, skills: ["IT Infrastructure", "Security", "Vendor Management"] },
    { code: "NISS005", first: "Priya", last: "Sharma", designation: "QA Engineer", dept: dTech, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 2.1, gross: 62000, dobMonth: 9, dobDay: 30, skills: ["Automation", "Selenium", "API Testing"] },
    { code: "NISS006", first: "Amit", last: "Trivedi", designation: "Backend Developer", dept: dTech, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 3.0, gross: 72000, dobMonth: 4, dobDay: 17, skills: ["Node.js", "Python", "Redis", "Docker"] },
    { code: "NISS007", first: "Neha", last: "Sharma", designation: "Frontend Developer", dept: dTech, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 2.6, gross: 68000, dobMonth: 9, dobDay: 18, skills: ["React", "Tailwind", "Framer Motion"] },
    { code: "NISS008", first: "Rahul", last: "Joshi", designation: "DevOps Engineer", dept: dTech, branch: branchAmd, role: "EMPLOYEE", shift: "GEN", dojYears: 5.2, gross: 94000, dobMonth: 12, dobDay: 2, skills: ["Kubernetes", "CI/CD", "Terraform"] },
    { code: "NISS009", first: "Sneha", last: "Iyer", designation: "Data Analyst", dept: dTech, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 1.8, gross: 58000, dobMonth: 2, dobDay: 11, skills: ["SQL", "PowerBI", "Python"] },
    { code: "NISS010", first: "Karan", last: "Malhotra", designation: "Business Analyst", dept: dTech, branch: branchBom, role: "EMPLOYEE", shift: "GEN", dojYears: 3.4, gross: 76000, dobMonth: 6, dobDay: 25, skills: ["Jira", "Confluence", "Process Design"] },
    { code: "NISS011", first: "Divya", last: "Nair", designation: "UI/UX Designer", dept: dTech, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 2.9, gross: 70000, dobMonth: 8, dobDay: 8, skills: ["Figma", "Design Systems", "User Research"] },
    { code: "NISS012", first: "Mohit", last: "Agarwal", designation: "Accounts Executive", dept: dFin, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 1.5, gross: 48000, dobMonth: 10, dobDay: 20, skills: ["Tally", "GST", "Reconciliation"] },
    { code: "NISS013", first: "Ritu", last: "Bansal", designation: "Finance Manager", dept: dFin, branch: branchHQ, role: "MANAGER", shift: "GEN", dojYears: 7.3, gross: 135000, dobMonth: 5, dobDay: 14, skills: ["FP&A", "Budgeting", "Audit"] },
    { code: "NISS014", first: "Suresh", last: "Kumar", designation: "Sales Executive", dept: dSales, branch: branchBom, role: "EMPLOYEE", shift: "EVE", dojYears: 2.2, gross: 54000, dobMonth: 3, dobDay: 3, skills: ["CRM", "Negotiation"] },
    { code: "NISS015", first: "Pooja", last: "Reddy", designation: "Regional Sales Manager", dept: dSales, branch: branchBom, role: "MANAGER", shift: "GEN", dojYears: 6.0, gross: 138000, dobMonth: 11, dobDay: 27, skills: ["Sales Strategy", "Key Accounts"] },
    { code: "NISS016", first: "Arjun", last: "Verma", designation: "Operations Executive", dept: dOps, branch: branchAmd, role: "EMPLOYEE", shift: "GEN", dojYears: 1.1, gross: 42000, dobMonth: 7, dobDay: 19, skills: ["Logistics", "Vendor Ops"] },
    { code: "NISS017", first: "Kavya", last: "Gowda", designation: "HR Executive", dept: dHR, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 0.9, gross: 46000, dobMonth: 1, dobDay: 30, skills: ["Onboarding", "Employee Engagement"] },
    { code: "NISS018", first: "Nikhil", last: "Bhatt", designation: "Full Stack Developer", dept: dTech, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 2.4, gross: 74000, dobMonth: 4, dobDay: 6, skills: ["Next.js", "GraphQL", "Prisma"] },
    { code: "NISS019", first: "Meera", last: "Pillai", designation: "Technical Writer", dept: dTech, branch: branchBom, role: "EMPLOYEE", shift: "GEN", dojYears: 3.7, gross: 56000, dobMonth: 2, dobDay: 28, skills: ["Documentation", "Markdown", "API Docs"] },
    { code: "NISS020", first: "Sanjay", last: "Rao", designation: "Senior DevOps Engineer", dept: dTech, branch: branchHQ, role: "EMPLOYEE", shift: "NGT", dojYears: 4.5, gross: 102000, dobMonth: 6, dobDay: 12, skills: ["AWS", "Kubernetes", "Observability"] },
    { code: "NISS021", first: "Aisha", last: "Khan", designation: "Recruitment Specialist", dept: dHR, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 1.6, gross: 52000, dobMonth: 12, dobDay: 15, skills: ["Sourcing", "Interviewing"] },
    { code: "NISS022", first: "Varun", last: "Sinha", designation: "Junior Developer", dept: dTech, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 0.3, gross: 36000, dobMonth: 8, dobDay: 21, probation: true, skills: ["JavaScript", "React"] },
    { code: "NISS023", first: "Lakshmi", last: "Menon", designation: "Payroll Specialist", dept: dHR, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 5.8, gross: 66000, dobMonth: 10, dobDay: 3, skills: ["Payroll", "Statutory Compliance"] },
    { code: "NISS024", first: "Deepak", last: "Chauhan", designation: "Network Engineer", dept: dOps, branch: branchAmd, role: "EMPLOYEE", shift: "NGT", dojYears: 3.1, gross: 68000, dobMonth: 5, dobDay: 7, skills: ["Routing", "Firewalls", "VPN"] },
    { code: "NISS025", first: "Farah", last: "Ali", designation: "Customer Success Associate", dept: dSales, branch: branchBom, role: "EMPLOYEE", shift: "GEN", dojYears: 0.8, gross: 44000, dobMonth: 9, dobDay: 9, probation: true, skills: ["Account Management", "Zendesk"] },
    { code: "NISS026", first: "Gaurav", last: "Kulkarni", designation: "Test Lead", dept: dTech, branch: branchHQ, role: "EMPLOYEE", shift: "GEN", dojYears: 5.0, gross: 88000, dobMonth: 3, dobDay: 16, skills: ["Test Strategy", "Cypress", "Performance"] },
  ];

  const shiftMap: Record<string, string> = { GEN: shiftGEN.id, EVE: shiftEVE.id, NGT: shiftNIGHT.id };
  const employees: Record<string, { id: string; gross: number; first: string; last: string; role: string; dept: string; shiftCode: string }> = {};

  for (const s of specs) {
    const dob = new Date(Date.UTC(year - 28 - ri(0, 9), s.dobMonth, s.dobDay));
    const emp = await db.employee.create({
      data: {
        empCode: s.code, firstName: s.first, lastName: s.last,
        email: `${s.first.toLowerCase()}.${s.last.toLowerCase()}@niss.tech`,
        phone: `+91 9${ri(100000000, 999999999)}`,
        designation: s.designation, departmentId: s.dept, branchId: s.branch.id, companyId: company.id,
        role: s.role, status: s.probation ? "PROBATION" : "ACTIVE",
        dateOfJoining: new Date(today.getTime() - Math.round(s.dojYears * 365.25) * 86400000),
        dateOfBirth: dob, gender: rand() > 0.5 ? "Male" : "Female",
        address: `${ri(10, 99)}, ${pick(["Ring Road", "Adajan", "Vesu", "Piplod", "City Light"])}, ${pick(["Surat", "Ahmedabad", "Mumbai"])}, Gujarat`,
        emergencyName: pick(["Spouse", "Parent", "Sibling"]), emergencyPhone: `+91 9${ri(100000000, 999999999)}`,
        bankName: pick(["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank"]),
        bankAccount: `XXXX${ri(1000, 9999)}`, panNumber: `ABCPD${ri(1000, 9999)}E`,
        taxRegime: pick(["NEW", "OLD"]),
        skills: JSON.stringify(s.skills),
        education: JSON.stringify([
          { degree: "B.E. Computer Engineering", institute: "SVNIT / Gujarat University", year: year - 24 - ri(0, 6) },
        ]),
        experience: JSON.stringify([]),
      },
    });
    employees[s.code] = { id: emp.id, gross: s.gross, first: s.first, last: s.last, role: s.role, dept: s.dept, shiftCode: s.shift };
    await db.user.create({
      data: { email: emp.email, passwordHash: hashPassword("demo123"), employeeId: emp.id },
    });
  }

  // reporting lines
  const rep: Record<string, string> = {
    NISS002: "NISS004", NISS003: "NISS004", NISS004: "NISS004",
    NISS013: "NISS004", NISS015: "NISS004",
  };
  for (const s of specs) {
    if (!rep[s.code]) {
      if (s.dept === dTech) rep[s.code] = "NISS002";
      else if (s.dept === dHR) rep[s.code] = "NISS003";
      else if (s.dept === dFin) rep[s.code] = "NISS013";
      else if (s.dept === dSales) rep[s.code] = "NISS015";
      else rep[s.code] = "NISS004";
    }
    if (rep[s.code] === s.code) continue;
    await db.employee.update({ where: { empCode: s.code }, data: { managerId: employees[rep[s.code]].id } });
  }

  // ── holidays ────────────────────────────────────────────────
  await db.holiday.create({ data: { companyId: company.id, name: "Independence Day", date: new Date(Date.UTC(year, 7, 15)), type: "PUBLIC" } });
  await db.holiday.create({ data: { companyId: company.id, name: "Company Foundation Day", date: addDays(today, 6), type: "COMPANY" } });
  await db.holiday.create({ data: { companyId: company.id, name: "Regional Festival Holiday", date: addDays(today, 12), type: "PUBLIC" } });
  await db.holiday.create({ data: { companyId: company.id, name: "Diwali Break", date: addDays(today, 40), type: "PUBLIC" } });

  // ── shift roster (last 45 days + next 21 days) ──────────────
  for (const s of specs) {
    for (let d = -45; d <= 21; d++) {
      const day = addDays(today, d);
      if (dow(day) === 0) continue; // weekly off
      await db.shiftAssignment.create({
        data: { employeeId: employees[s.code].id, shiftId: shiftMap[s.shift], date: day },
      });
    }
  }

  // ── attendance history (last 45 days, excluding today) ──────
  let leaveReqCode = 1000;
  const leaveReqIds: string[] = [];
  for (const s of specs) {
    const empId = employees[s.code].id;
    for (let d = -45; d <= -1; d++) {
      const day = addDays(today, d);
      const dowI = dow(day);
      const shiftCode = s.shift;
      const required = shiftCode === "NGT" ? 540 : 510;
      // weekly off
      if (dowI === 0) {
        await db.attendanceDay.create({ data: { employeeId: empId, date: day, shiftId: shiftMap[shiftCode], status: "WO", requiredMinutes: 0 } });
        continue;
      }
      // foundation of event log
      const ev: { type: string; ts: Date; breakType?: string }[] = [];
      let state = "NOT_STARTED", status = "A", firstCheckIn: Date | null = null, lastCheckOut: Date | null = null;
      let gross = 0, brk = 0, lateM = 0, earlyM = 0, otM = 0, requiredMin = required;
      const roll = rand();
      const [sh, smm] = shiftCode === "NGT" ? [22, 0] : shiftCode === "EVE" ? [14, 0] : [9, 30];

      if (d === -1 && s.code === "NISS001") {
        // yesterday: Rohit missing checkout → drives regularization warning
        firstCheckIn = ist(day, 9, 27);
        ev.push({ type: "CHECK_IN", ts: firstCheckIn });
        state = "WORKING"; status = "MP"; // missing punch
        gross = 540; brk = 38;
      } else if (roll < 0.04) {
        status = "A"; // absent
      } else if (roll < 0.09) {
        status = "L"; // leave day
      } else if (roll < 0.13) {
        status = "WFH"; // WFH
        firstCheckIn = ist(day, sh, smm + ri(-8, 22));
        lastCheckOut = ist(day, sh + 8, smm + ri(30, 55));
        ev.push({ type: "CHECK_IN", ts: firstCheckIn }, { type: "CHECK_OUT", ts: lastCheckOut });
        state = "CHECKED_OUT"; gross = 500; brk = 40; lateM = 0;
      } else if (roll < 0.155) {
        status = "OD"; // on duty
        firstCheckIn = ist(day, 10, ri(0, 45));
        lastCheckOut = ist(day, 18, ri(10, 50));
        ev.push({ type: "CHECK_IN", ts: firstCheckIn }, { type: "CHECK_OUT", ts: lastCheckOut });
        state = "CHECKED_OUT"; gross = 490; brk = 45;
      } else if (roll < 0.175) {
        status = "MP"; // missing punch
        firstCheckIn = ist(day, sh, smm + ri(-10, 18));
        ev.push({ type: "CHECK_IN", ts: firstCheckIn });
        state = "WORKING"; gross = 510; brk = 35;
      } else {
        // present
        const inMin = smm + ri(-14, 38);
        firstCheckIn = ist(day, sh, inMin);
        ev.push({ type: "CHECK_IN", ts: firstCheckIn });
        lateM = inMin > smm + 15 ? inMin - smm : 0;
        const outMin = smm + required + ri(-15, 55);
        lastCheckOut = ist(day, sh + Math.floor(outMin / 60), outMin % 60);
        ev.push({ type: "CHECK_OUT", ts: lastCheckOut });
        // breaks
        const teaStart = ist(day, sh + 2, ri(0, 30));
        ev.push({ type: "BREAK_START", ts: teaStart, breakType: "TEA" });
        ev.push({ type: "BREAK_END", ts: new Date(teaStart.getTime() + ri(8, 18) * 60000) });
        const lunchStart = ist(day, 13, ri(0, 30));
        ev.push({ type: "BREAK_START", ts: lunchStart, breakType: "LUNCH" });
        ev.push({ type: "BREAK_END", ts: new Date(lunchStart.getTime() + ri(25, 45) * 60000) });
        brk = ri(30, 70);
        gross = Math.round((lastCheckOut.getTime() - firstCheckIn.getTime()) / 60000);
        otM = Math.max(0, gross - brk - required);
        earlyM = Math.max(0, required - (gross - brk));
        state = "CHECKED_OUT";
        status = gross - brk < 240 ? "HD" : "P";
      }
      const dayRow = await db.attendanceDay.create({
        data: {
          employeeId: empId, date: day, shiftId: shiftMap[shiftCode],
          state, status, firstCheckIn, lastCheckOut,
          checkInSource: firstCheckIn ? pick(["WEB", "MOBILE", "BIOMETRIC", "WEB"]) : null,
          checkOutSource: lastCheckOut ? "WEB" : null,
          deviceInfo: "Chrome · Windows",
          grossMinutes: gross, netMinutes: Math.max(0, gross - brk), breakMinutes: brk,
          requiredMinutes: requiredMin, lateMinutes: lateM, earlyMinutes: earlyM, overtimeMinutes: otM,
        },
      });
      for (const e of ev) {
        await db.attendanceEvent.create({
          data: { employeeId: empId, dayId: dayRow.id, type: e.type, breakType: e.breakType ?? null, timestamp: e.ts, source: "WEB", device: "Chrome · Windows" },
        });
      }
      // a few approved leave requests in the past for realism
      if (status === "L" && rand() < 0.5 && leaveReqIds.length < 60) {
        const lt = pick([ltCL, ltSL, ltEL]);
        const lr = await db.leaveRequest.create({
          data: {
            code: `LR-${++leaveReqCode}`, employeeId: empId, leaveTypeId: lt.id,
            fromDate: day, toDate: day, dayMode: "FULL", days: 1,
            reason: pick(["Family function", "Not feeling well", "Personal work", "Travel out of station"]),
            status: "APPROVED", currentStage: "DONE",
            approverId: employees["NISS002"].id, decidedAt: new Date(day.getTime() + 3600000),
            decisionNote: "Approved",
          },
        });
        leaveReqIds.push(lr.id);
      }
    }
  }

  // ── today's live attendance ─────────────────────────────────
  async function todayRow(code: string, opts: {
    state: string; status: string; inH?: number; inM?: number; outH?: number; outM?: number;
    breaks?: { start: [number, number]; end: [number, number]; type: string }[];
    source?: string; required?: number;
  }) {
    const empId = employees[code].id;
    const required = opts.required ?? (employees[code].shiftCode === "NGT" ? 540 : 510);
    const firstCheckIn = opts.inH !== undefined ? ist(today, opts.inH, opts.inM ?? 0) : null;
    const lastCheckOut = opts.outH !== undefined ? ist(today, opts.outH, opts.outM ?? 0) : null;
    const gross = firstCheckIn && lastCheckOut ? Math.round((lastCheckOut.getTime() - firstCheckIn.getTime()) / 60000) : firstCheckIn ? Math.round((now.getTime() - firstCheckIn.getTime()) / 60000) : 0;
    const brk = (opts.breaks ?? []).reduce((acc, b) => acc + Math.round((ist(today, b.end[0], b.end[1]).getTime() - ist(today, b.start[0], b.start[1]).getTime()) / 60000), 0);
    const row = await db.attendanceDay.create({
      data: {
        employeeId: empId, date: today, shiftId: shiftMap[employees[code].shiftCode],
        state: opts.state, status: opts.status, firstCheckIn, lastCheckOut,
        checkInSource: firstCheckIn ? (opts.source ?? "WEB") : null,
        grossMinutes: gross, netMinutes: Math.max(0, gross - brk), breakMinutes: brk,
        requiredMinutes: required, lateMinutes: 0, earlyMinutes: 0, overtimeMinutes: 0,
        deviceInfo: "Chrome · Windows",
      },
    });
    if (firstCheckIn) {
      await db.attendanceEvent.create({ data: { employeeId: empId, dayId: row.id, type: "CHECK_IN", timestamp: firstCheckIn, source: opts.source ?? "WEB", device: "Chrome · Windows" } });
      for (const b of opts.breaks ?? []) {
        await db.attendanceEvent.create({ data: { employeeId: empId, dayId: row.id, type: "BREAK_START", breakType: b.type, timestamp: ist(today, b.start[0], b.start[1]), source: "WEB" } });
        await db.attendanceEvent.create({ data: { employeeId: empId, dayId: row.id, type: "BREAK_END", breakType: b.type, timestamp: ist(today, b.end[0], b.end[1]), source: "WEB" } });
      }
      if (lastCheckOut) {
        await db.attendanceEvent.create({ data: { employeeId: empId, dayId: row.id, type: "CHECK_OUT", timestamp: lastCheckOut, source: "WEB" } });
      }
    }
    return row;
  }

  // Rohit: WORKING since 09:27, tea + lunch completed (only if those times are in the past)
  const nowHM = now.getTime() + IST_OFFSET_MS - today.getTime();
  const minsNow = (nowHM % 86400000) / 60000;
  const rohitBreaks: { start: [number, number]; end: [number, number]; type: string }[] = [];
  if (minsNow > 11 * 60 + 50) rohitBreaks.push({ start: [11, 35], end: [11, 50], type: "TEA" });
  if (minsNow > 13 * 60 + 38) rohitBreaks.push({ start: [13, 5], end: [13, 38], type: "LUNCH" });
  const rohitIn: [number, number] = minsNow > 9 * 60 + 30 ? [9, 27] : [Math.max(0, Math.floor(minsNow / 60) - 2), Math.floor(minsNow % 60)];
  const rohitToday = await todayRow("NISS001", { state: "WORKING", status: "P", inH: rohitIn[0], inM: rohitIn[1], breaks: rohitBreaks });

  await todayRow("NISS002", { state: "WORKING", status: "P", inH: 9, inM: 31, breaks: minsNow > 11 * 60 + 45 ? [{ start: [11, 30], end: [11, 44], type: "TEA" }] : [] });
  await todayRow("NISS003", { state: "WORKING", status: "P", inH: 9, inM: 24, source: "BIOMETRIC" });
  await todayRow("NISS004", { state: "WORKING", status: "P", inH: 9, inM: 12, source: "MOBILE" });
  await todayRow("NISS005", { state: "NOT_STARTED", status: "PENDING" });
  await todayRow("NISS006", { state: "WORKING", status: "P", inH: 9, inM: 18 });
  await todayRow("NISS007", { state: minsNow > 13 * 60 + 5 ? "ON_BREAK" : "WORKING", status: "P", inH: 9, inM: 33, breaks: minsNow > 11 * 60 + 40 ? [{ start: [11, 40], end: [11, 52], type: "TEA" }] : [] });
  await todayRow("NISS009", { state: "WORKING", status: "P", inH: 9, inM: 41 });
  await todayRow("NISS011", { state: "WORKING", status: "WFH", inH: 9, inM: 22, source: "WEB" });
  await todayRow("NISS018", { state: "WORKING", status: "P", inH: 9, inM: 26 });
  await todayRow("NISS022", { state: "NOT_STARTED", status: "PENDING" });
  await todayRow("NISS026", { state: "WORKING", status: "P", inH: 9, inM: 14 });
  // Rahul on leave; Varun not checked in; night shift starts later
  await db.attendanceDay.create({ data: { employeeId: employees["NISS008"].id, date: today, shiftId: shiftGEN.id, status: "L", state: "NOT_STARTED", requiredMinutes: 510 } });
  for (const code of ["NISS010", "NISS012", "NISS014", "NISS016", "NISS017", "NISS019", "NISS021", "NISS023", "NISS025"]) {
    await db.attendanceDay.create({ data: { employeeId: employees[code].id, date: today, shiftId: shiftMap[employees[code].shiftCode], status: "PENDING", state: "NOT_STARTED", requiredMinutes: 510 } });
  }
  for (const code of ["NISS020", "NISS024"]) {
    await db.attendanceDay.create({ data: { employeeId: employees[code].id, date: today, shiftId: shiftNIGHT.id, status: "PENDING", state: "NOT_STARTED", requiredMinutes: 540 } });
  }

  // ── leave balances (current year) ───────────────────────────
  for (const s of specs) {
    const used = ri(0, 4);
    const usedSL = ri(0, 2);
    const usedEL = ri(0, 6);
    const pend = s.code === "NISS001" ? 1 : 0;
    await db.leaveBalance.create({ data: { employeeId: employees[s.code].id, leaveTypeId: ltCL.id, year, entitled: 12, used, pending: pend } });
    await db.leaveBalance.create({ data: { employeeId: employees[s.code].id, leaveTypeId: ltSL.id, year, entitled: 8, used: usedSL, pending: 0 } });
    await db.leaveBalance.create({ data: { employeeId: employees[s.code].id, leaveTypeId: ltEL.id, year, entitled: 15, used: usedEL, pending: 0 } });
    await db.leaveBalance.create({ data: { employeeId: employees[s.code].id, leaveTypeId: ltCO.id, year, entitled: 6, used: ri(0, 2), pending: 0 } });
  }

  // ── leave requests ──────────────────────────────────────────
  const rohitId = employees["NISS001"].id;
  const anitaId = employees["NISS002"].id;
  const payalId = employees["NISS003"].id;

  await db.leaveRequest.create({ data: {
    code: "LR-1042", employeeId: rohitId, leaveTypeId: ltCL.id,
    fromDate: addDays(today, -30), toDate: addDays(today, -29), dayMode: "FULL", days: 2,
    reason: "Family function at hometown", contactDuringLeave: "+91 98765 43210",
    status: "APPROVED", currentStage: "DONE", approverId: anitaId,
    decidedAt: addDays(today, -33), decisionNote: "Approved. Handover noted.",
  } });
  await db.leaveRequest.create({ data: {
    code: "LR-1058", employeeId: rohitId, leaveTypeId: ltSL.id,
    fromDate: addDays(today, -12), toDate: addDays(today, -12), dayMode: "FULL", days: 1,
    reason: "Fever and cold", status: "APPROVED", currentStage: "DONE",
    approverId: anitaId, decidedAt: addDays(today, -13), decisionNote: "Get well soon.",
  } });
  await db.leaveRequest.create({ data: {
    code: "LR-1071", employeeId: rohitId, leaveTypeId: ltCL.id,
    fromDate: addDays(today, -8), toDate: addDays(today, -8), dayMode: "FULL", days: 1,
    reason: "Personal work", status: "REJECTED", currentStage: "DONE",
    approverId: anitaId, decidedAt: addDays(today, -9), decisionNote: "Release crunch this sprint, please re-plan.",
  } });
  await db.leaveRequest.create({ data: {
    code: "LR-1082", employeeId: rohitId, leaveTypeId: ltEL.id,
    fromDate: addDays(today, 21), toDate: addDays(today, 22), dayMode: "FULL", days: 2,
    reason: "Family trip to Jaipur", contactDuringLeave: "+91 98765 43210",
    status: "PENDING", currentStage: "MANAGER",
  } });
  await db.leaveRequest.create({ data: {
    code: "LR-1085", employeeId: employees["NISS006"].id, leaveTypeId: ltEL.id,
    fromDate: addDays(today, 2), toDate: addDays(today, 2), dayMode: "FULL", days: 1,
    reason: "Bank work", status: "PENDING", currentStage: "MANAGER",
  } });
  await db.leaveRequest.create({ data: {
    code: "LR-1086", employeeId: employees["NISS005"].id, leaveTypeId: ltSL.id,
    fromDate: addDays(today, 4), toDate: addDays(today, 5), dayMode: "FULL", days: 2,
    reason: "Medical checkup", status: "PENDING", currentStage: "MANAGER",
  } });
  await db.leaveRequest.create({ data: {
    code: "LR-1087", employeeId: employees["NISS007"].id, leaveTypeId: ltCL.id,
    fromDate: addDays(today, 9), toDate: addDays(today, 9), dayMode: "FULL", days: 1,
    reason: "Sister's wedding shopping", status: "PENDING", currentStage: "MANAGER",
  } });
  // Rahul's approved leave covering today
  await db.leaveRequest.create({ data: {
    code: "LR-1088", employeeId: employees["NISS008"].id, leaveTypeId: ltSL.id,
    fromDate: today, toDate: today, dayMode: "FULL", days: 1,
    reason: "Not feeling well", status: "APPROVED", currentStage: "DONE",
    approverId: anitaId, decidedAt: new Date(now.getTime() - 2 * 3600000), decisionNote: "Take rest.",
  } });

  // ── duty requests (WFH / on-duty) ───────────────────────────
  await db.dutyRequest.create({ data: {
    code: "DR-201", employeeId: rohitId, type: "WFH",
    fromDate: addDays(today, -14), toDate: addDays(today, -14), hours: 8,
    reason: "Internet installation at home, ISP appointment", address: "402, Silver Oak Residency, Adajan, Surat",
    status: "APPROVED", approverId: anitaId, decidedAt: addDays(today, -15), decisionNote: "Approved.",
  } });
  await db.dutyRequest.create({ data: {
    code: "DR-204", employeeId: rohitId, type: "ON_DUTY", subtype: "CLIENT_VISIT",
    fromDate: addDays(today, -7), toDate: addDays(today, -7), hours: 6,
    reason: "Deployment support at client production environment",
    destination: "Acme Corp, Mumbai", clientName: "Acme Corp",
    status: "APPROVED", approverId: anitaId, decidedAt: addDays(today, -8), decisionNote: "Approved. Share visit report.",
  } });
  await db.dutyRequest.create({ data: {
    code: "DR-207", employeeId: employees["NISS011"].id, type: "WFH",
    fromDate: today, toDate: today, hours: 8,
    reason: "Design review marathon — focus work from home",
    status: "APPROVED", approverId: anitaId, decidedAt: new Date(now.getTime() - 26 * 3600000), decisionNote: "Approved.",
  } });
  await db.dutyRequest.create({ data: {
    code: "DR-209", employeeId: employees["NISS006"].id, type: "WFH",
    fromDate: addDays(today, 2), toDate: addDays(today, 2), hours: 8,
    reason: "Apartment maintenance work", status: "PENDING",
  } });
  await db.dutyRequest.create({ data: {
    code: "DR-210", employeeId: employees["NISS009"].id, type: "ON_DUTY", subtype: "TRAINING",
    fromDate: addDays(today, 3), toDate: addDays(today, 3), hours: 8,
    reason: "Advanced SQL workshop by DataLabs", destination: "DataLabs Training Center, Ahmedabad",
    status: "PENDING",
  } });

  // ── regularizations ─────────────────────────────────────────
  await db.regularization.create({ data: {
    code: "AR-301", employeeId: employees["NISS005"].id,
    date: addDays(today, -2), currentCheckIn: ist(addDays(today, -2), 9, 34), currentCheckOut: null,
    requestedCheckIn: ist(addDays(today, -2), 9, 34), requestedCheckOut: ist(addDays(today, -2), 18, 42),
    reason: "Forgot to check out while leaving — server room verification with security", status: "PENDING",
  } });

  // ── tasks ───────────────────────────────────────────────────
  const tasks = [
    { t: "Client report — September billing summary", project: "Acme Corp", pr: "HIGH", st: "IN_PROGRESS", due: ist(today, 16, 0), prog: 45, by: "Anita Desai" },
    { t: "Verify payroll data before cut-off", project: "Internal", pr: "URGENT", st: "TODO", due: ist(today, 18, 0), prog: 0, by: "Payal Mehta" },
    { t: "Fix API pagination regression", project: "Project Alpha", pr: "HIGH", st: "REVIEW", due: ist(today, 18, 30), prog: 90, by: "Anita Desai" },
    { t: "Team update — sprint 14 highlights", project: "Internal", pr: "MEDIUM", st: "COMPLETED", due: ist(today, 11, 0), prog: 100, by: "Anita Desai" },
    { t: "Refactor auth middleware", project: "Project Alpha", pr: "MEDIUM", st: "BLOCKED", due: addDays(today, 1), prog: 30, by: "Anita Desai" },
    { t: "Prepare OKR draft for Q4", project: "Internal", pr: "LOW", st: "TODO", due: addDays(today, 3), prog: 0, by: "Anita Desai" },
    { t: "Update API documentation v2.3", project: "Project Alpha", pr: "MEDIUM", st: "TODO", due: addDays(today, 4), prog: 10, by: "Anita Desai" },
    { t: "Security patch review — Node 22", project: "Internal", pr: "HIGH", st: "IN_PROGRESS", due: addDays(today, 2), prog: 60, by: "Vikram Shah" },
  ];
  for (const tk of tasks) {
    await db.task.create({
      data: {
        employeeId: rohitId, title: tk.t, project: tk.project, priority: tk.pr, status: tk.st,
        dueAt: tk.due, assignedBy: tk.by, progress: tk.prog,
        completedAt: tk.st === "COMPLETED" ? new Date() : null,
        description: `${tk.t} — tracked under ${tk.project}. Update progress as work advances.`,
      },
    });
  }
  for (const code of ["NISS005", "NISS006", "NISS007", "NISS018", "NISS026"]) {
    for (let i = 0; i < 3; i++) {
      await db.task.create({
        data: {
          employeeId: employees[code].id,
          title: pick(["Write regression suite", "Review PR #", "Sync with QA", "Update runbook", "Bug triage", "Client escalation follow-up"]) + ` ${ri(100, 999)}`,
          project: pick(["Project Alpha", "Internal", "Support", "Training"]),
          priority: pick(["LOW", "MEDIUM", "HIGH"]), status: pick(["TODO", "IN_PROGRESS", "COMPLETED"]),
          dueAt: addDays(today, ri(0, 5)), assignedBy: "Anita Desai", progress: ri(0, 100),
        },
      });
    }
  }

  // ── calendar events ─────────────────────────────────────────
  await db.calendarEvent.create({ data: { employeeId: rohitId, title: "Daily Standup", type: "MEETING", startAt: ist(today, 10, 30), endAt: ist(today, 10, 45), location: "Meet · Standup Room", organizer: "Anita Desai", attendees: "Tech Team" } });
  await db.calendarEvent.create({ data: { employeeId: rohitId, title: "Client Meeting — Acme Corp", type: "MEETING", startAt: ist(today, 14, 0), endAt: ist(today, 15, 0), location: "Google Meet", organizer: "Pooja Reddy", attendees: "Anita, Rohit, Karan" } });
  await db.calendarEvent.create({ data: { employeeId: rohitId, title: "Sprint 14 Review", type: "REVIEW", startAt: ist(addDays(today, 1), 15, 0), endAt: ist(addDays(today, 1), 16, 0), location: "Conf Room A", organizer: "Anita Desai", attendees: "Tech Team" } });
  await db.calendarEvent.create({ data: { employeeId: rohitId, title: "Team Review — Monthly", type: "REVIEW", startAt: ist(addDays(today, 3), 16, 0), endAt: ist(addDays(today, 3), 17, 0), location: "Conf Room B", organizer: "Anita Desai" } });
  await db.calendarEvent.create({ data: { employeeId: rohitId, title: "Information Security Training", type: "TRAINING", startAt: ist(addDays(today, 2), 11, 0), endAt: ist(addDays(today, 2), 13, 0), location: "L&D Portal", organizer: "Kavya Gowda" } });
  await db.calendarEvent.create({ data: { companyId: company.id, title: "Quarterly Town Hall", type: "EVENT", startAt: ist(addDays(today, 5), 16, 0), endAt: ist(addDays(today, 5), 17, 30), allDay: false, location: "Auditorium", organizer: "Payal Mehta", attendees: "All Employees" } });
  await db.calendarEvent.create({ data: { employeeId: rohitId, title: "1:1 with Anita", type: "MEETING", startAt: ist(addDays(today, -1), 15, 30), endAt: ist(addDays(today, -1), 16, 0), location: "Meet", organizer: "Anita Desai" } });
  for (const code of ["NISS002", "NISS005", "NISS006", "NISS007", "NISS008", "NISS018", "NISS026", "NISS011", "NISS009"]) {
    await db.calendarEvent.create({ data: { employeeId: employees[code].id, title: "Daily Standup", type: "MEETING", startAt: ist(today, 10, 30), endAt: ist(today, 10, 45), location: "Meet · Standup Room", organizer: "Anita Desai", attendees: "Tech Team" } });
  }

  // ── timesheets ──────────────────────────────────────────────
  const monday = addDays(today, -((dow(today) + 6) % 7));
  const projects = ["Project Alpha", "Internal", "Support", "Training"];
  for (let w = 0; w < 3; w++) {
    const weekStart = addDays(monday, -7 * w);
    for (let d = 0; d < 5; d++) {
      if (addDays(weekStart, d) >= today) continue;
      const entries = w === 0 ? 2 : ri(2, 3);
      for (let e = 0; e < entries; e++) {
        const proj = projects[(e + d) % 4];
        const startM = 570 + e * 240 + ri(-15, 15);
        const endM = Math.min(1050, startM + ri(120, 210));
        await db.timesheetEntry.create({
          data: {
            employeeId: rohitId, date: addDays(weekStart, d), weekStart,
            project: proj, taskName: pick(["Development", "Code review", "Client call", "Bug fixing", "Documentation", "Deployment"]),
            description: `${proj} workstream`, startMinutes: startM, endMinutes: endM,
            minutes: (endM - startM), billable: proj !== "Internal" && proj !== "Training",
            status: w === 0 ? "DRAFT" : "SUBMITTED",
            submittedAt: w === 0 ? null : addDays(weekStart, 5),
          },
        });
      }
    }
  }

  // ── payroll ─────────────────────────────────────────────────
  const curMonth = today.getUTCMonth(), curYear = today.getUTCFullYear();
  const prev = curMonth === 0 ? { m: 11, y: curYear - 1 } : { m: curMonth - 1, y: curYear };
  const prev2 = prev.m === 0 ? { m: 11, y: prev.y - 1 } : { m: prev.m - 1, y: prev.y };

  const periodCur = await db.payrollPeriod.create({ data: { companyId: company.id, month: curMonth + 1, year: curYear, status: "PROCESSING", payDate: new Date(Date.UTC(curYear, curMonth + 1, 0)) } });
  const periodPrev = await db.payrollPeriod.create({ data: { companyId: company.id, month: prev.m + 1, year: prev.y, status: "PAID", payDate: new Date(Date.UTC(prev.y, prev.m + 1, 28)) } });
  const periodPrev2 = await db.payrollPeriod.create({ data: { companyId: company.id, month: prev2.m + 1, year: prev2.y, status: "PAID", payDate: new Date(Date.UTC(prev2.y, prev2.m + 1, 28)) } });

  for (const s of specs) {
    const gross = employees[s.code].gross;
    for (const per of [periodPrev2, periodPrev]) {
      const basic = Math.round(gross * 0.5);
      const hra = Math.round(gross * 0.2);
      const special = gross - basic - hra;
      const epf = Math.min(1800, Math.round(basic * 0.12));
      const ptax = 200;
      const tds = Math.round(gross * (gross > 100000 ? 0.09 : gross > 60000 ? 0.06 : 0.03));
      const deductions = epf + ptax + tds;
      const otH = rand() < 0.3 ? ri(1, 6) : 0;
      const otAmt = Math.round((gross / 176) * otH * 1.5);
      const isRohit = s.code === "NISS001" && per.id === periodPrev.id;
      await db.payslip.create({
        data: {
          employeeId: employees[s.code].id, periodId: per.id,
          gross: isRohit ? 85000 : gross + otAmt,
          basic: isRohit ? 42500 : basic, hra: isRohit ? 17000 : hra, specialAllowance: isRohit ? 25500 : special,
          bonus: 0, overtimeHours: otH, overtimeAmount: otAmt, reimbursement: 0,
          ptax: isRohit ? 200 : ptax, epf: isRohit ? 1800 : epf, tds: isRohit ? 7420 : tds,
          deductions: isRohit ? 9420 : deductions,
          net: isRohit ? 75580 : gross + otAmt - deductions,
          payableDays: 26 - ri(0, 2), lopDays: rand() < 0.2 ? 1 : 0,
          status: "PAID",
          earningsJson: JSON.stringify([
            { label: "Basic Salary", amount: isRohit ? 42500 : basic },
            { label: "House Rent Allowance", amount: isRohit ? 17000 : hra },
            { label: "Special Allowance", amount: isRohit ? 25500 : special },
            { label: "Overtime", amount: otAmt },
          ]),
          deductionsJson: JSON.stringify([
            { label: "Provident Fund (EPF)", amount: isRohit ? 1800 : epf },
            { label: "Professional Tax", amount: 200 },
            { label: "TDS", amount: isRohit ? 7420 : tds },
          ]),
          generatedAt: per.payDate,
        },
      });
    }
  }

  // ── expenses ────────────────────────────────────────────────
  await db.expense.create({ data: { code: "EX-501", employeeId: rohitId, category: "TRAVEL", expenseDate: addDays(today, -22), amount: 3400, merchant: "Ola Cabs", project: "Acme Corp", description: "Client visit travel — Surat to Mumbai", status: "PAID", submittedAt: addDays(today, -21), decidedAt: addDays(today, -18), paidAt: addDays(today, -10), decisionNote: "Approved & paid with October cycle" } });
  await db.expense.create({ data: { code: "EX-514", employeeId: rohitId, category: "FOOD", expenseDate: addDays(today, -4), amount: 850, merchant: "Barbeque Nation", project: "Acme Corp", description: "Team dinner after release", status: "FINANCE_APPROVED", submittedAt: addDays(today, -3), decidedAt: addDays(today, -1), decisionNote: "Finance verified" } });
  await db.expense.create({ data: { code: "EX-517", employeeId: rohitId, category: "CLIENT", expenseDate: addDays(today, -1), amount: 5200, merchant: "Grand Hyatt", project: "Acme Corp", description: "Client workshop arrangement", status: "SUBMITTED", submittedAt: new Date(now.getTime() - 3600000) } });
  await db.expense.create({ data: { code: "EX-518", employeeId: rohitId, category: "HOTEL", expenseDate: addDays(today, -1), amount: 4200, merchant: "Hotel Ostendo", description: "Overnight stay during deployment", status: "DRAFT" } });
  await db.expense.create({ data: { code: "EX-509", employeeId: rohitId, category: "FUEL", expenseDate: addDays(today, -13), amount: 1800, merchant: "HP Petrol", description: "Local travel", status: "REJECTED", submittedAt: addDays(today, -12), decidedAt: addDays(today, -11), decisionNote: "Fuel reimbursement only for field roles" } });
  await db.expense.create({ data: { code: "EX-519", employeeId: employees["NISS006"].id, category: "SUPPLIES", expenseDate: addDays(today, -2), amount: 1450, merchant: "Staples", description: "Keyboard and mouse for testing", status: "SUBMITTED", submittedAt: addDays(today, -1) } });

  // ── documents ───────────────────────────────────────────────
  const docs = [
    { name: "Appointment Letter — Rohit Patel", cat: "APPOINTMENT", conf: "SENSITIVE", kb: 184, exp: null as number | null },
    { name: "Offer Letter — NISS Technologies", cat: "OFFER", conf: "SENSITIVE", kb: 156, exp: null },
    { name: "Employee ID Card (Digital)", cat: "ID", conf: "NORMAL", kb: 220, exp: 24 }, // expires in 24 days → amber alert
    { name: "Salary Revision Letter 2026", cat: "SALARY_REVISION", conf: "SENSITIVE", kb: 132, exp: null },
    { name: "Form 16 — FY 2025-26", cat: "TAX", conf: "SENSITIVE", kb: 412, exp: null },
    { name: "Experience Certificate", cat: "CERTIFICATE", conf: "NORMAL", kb: 98, exp: null },
    { name: "Code of Conduct Policy", cat: "POLICY", conf: "NORMAL", kb: 640, exp: null },
    { name: "Information Security Policy", cat: "POLICY", conf: "NORMAL", kb: 720, exp: null },
    { name: "Group Mediclaim Policy Card", cat: "CERTIFICATE", conf: "NORMAL", kb: 88, exp: -12, uploadedDaysAgo: 370 }, // expired 12 days ago → red alert (issued over a year back)
    { name: "Passport Scan (Front Page)", cat: "ID", conf: "SENSITIVE", kb: 310, exp: 420, uploadedDaysAgo: 200 }, // valid for over a year
  ];
  for (const d of docs) {
    await db.document.create({ data: { employeeId: rohitId, name: d.name, category: d.cat, fileExt: "pdf", sizeKb: d.kb, confidentiality: d.conf, uploadedAt: addDays(today, -(d.uploadedDaysAgo ?? ri(10, 300))), expiresAt: d.exp === null ? null : addDays(today, d.exp) } });
  }
  await db.document.create({ data: { employeeId: null, name: "Leave Policy 2026", category: "POLICY", fileExt: "pdf", sizeKb: 320, sharedWithTeam: true, uploadedAt: addDays(today, -60) } });
  await db.document.create({ data: { employeeId: null, name: "Working Hours & Overtime Policy", category: "POLICY", fileExt: "pdf", sizeKb: 280, sharedWithTeam: true, uploadedAt: addDays(today, -90) } });

  // ── HR tickets ──────────────────────────────────────────────
  await db.hrTicket.create({ data: {
    code: "HR-1042", employeeId: rohitId, category: "ATTENDANCE", subject: "Attendance discrepancy on Monday",
    description: "Biometric punch did not register on Monday although I was at office. Please verify with security log.",
    priority: "NORMAL", status: "IN_PROGRESS", assignee: "HR Operations",
    commentsJson: JSON.stringify([
      { by: "Kavya Gowda (HR)", at: new Date(now.getTime() - 20 * 3600000).toISOString(), text: "We have pulled the access-card log, verifying." },
    ]),
    createdAt: new Date(now.getTime() - 26 * 3600000), updatedAt: new Date(now.getTime() - 20 * 3600000),
  } });
  await db.hrTicket.create({ data: {
    code: "HR-1036", employeeId: rohitId, category: "PAYROLL", subject: "Overtime amount missing in August payslip",
    description: "Approved overtime of 4 hours not reflected in August payroll.", priority: "HIGH",
    status: "RESOLVED", assignee: "Payroll — Lakshmi Menon",
    commentsJson: JSON.stringify([
      { by: "Lakshmi Menon (Payroll)", at: new Date(now.getTime() - 96 * 3600000).toISOString(), text: "Verified and processed with arrears in current cycle." },
    ]),
    createdAt: new Date(now.getTime() - 120 * 3600000), updatedAt: new Date(now.getTime() - 96 * 3600000),
  } });
  await db.hrTicket.create({ data: { code: "HR-1050", employeeId: employees["NISS018"].id, category: "IT", subject: "Laptop battery draining fast", description: "Battery health dropped to 61%.", priority: "NORMAL", status: "OPEN", assignee: "IT Support", createdAt: new Date(now.getTime() - 6 * 3600000) } });
  // SLA showcase tickets (first-response SLA demo states):
  // HR-1048 — HIGH raised 10h ago, no response → SLA BREACHED (8h target, ~2h overdue)
  await db.hrTicket.create({ data: {
    code: "HR-1048", employeeId: rohitId, category: "IT", subject: "VPN disconnects every 30 minutes",
    description: "Since the client update this morning the VPN drops every half hour. Reconnecting takes 5+ minutes and I am losing meeting time.",
    priority: "HIGH", status: "OPEN", assignee: "IT Support",
    createdAt: new Date(now.getTime() - 10 * 3600000), updatedAt: new Date(now.getTime() - 10 * 3600000),
  } });
  // HR-1039 — NORMAL raised 45h ago, no response → AT RISK (3h left of 48h)
  await db.hrTicket.create({ data: {
    code: "HR-1039", employeeId: rohitId, category: "FACILITIES", subject: "Conference room AC making loud noise",
    description: "The unit in Bay-2 conference room rattles loudly during meetings. Please send a technician before the client review on Friday.",
    priority: "NORMAL", status: "OPEN", assignee: "Facilities",
    createdAt: new Date(now.getTime() - 45 * 3600000), updatedAt: new Date(now.getTime() - 45 * 3600000),
  } });
  // HR-1033 — URGENT responded in 30min → SLA MET, closed
  await db.hrTicket.create({ data: {
    code: "HR-1033", employeeId: rohitId, category: "HR", subject: "Name misspelled on insurance card",
    description: "My group mediclaim e-card reads 'Rohit Patle' instead of 'Rohit Patel'. Need a corrected card before my hospital visit.",
    priority: "URGENT", status: "CLOSED", assignee: "HR Operations",
    commentsJson: JSON.stringify([
      { by: "Kavya Gowda (HR)", at: new Date(now.getTime() - 79.5 * 3600000).toISOString(), text: "Apologies! Correction raised with the insurer — corrected e-card will be in your Documents within 24 hours." },
    ]),
    createdAt: new Date(now.getTime() - 80 * 3600000), updatedAt: new Date(now.getTime() - 78 * 3600000),
  } });

  // ── announcements ───────────────────────────────────────────
  const ann1 = await db.announcement.create({ data: { companyId: company.id, title: "Office closed on Foundation Day", body: "All offices will remain closed on Foundation Day. Team celebrations are planned for the preceding evening. Please plan deliverables accordingly.", level: "COMPANY", category: "HOLIDAY", priority: "IMPORTANT", requiresAck: false, publishedAt: new Date(now.getTime() - 40 * 3600000) } });
  await db.announcement.create({ data: { companyId: company.id, title: "Health insurance enrollment window is open", body: "The annual health insurance enrollment window is open for the next two weeks. Update dependents and opt for top-up covers via the HR portal.", level: "COMPANY", category: "BENEFITS", priority: "NORMAL", requiresAck: false, publishedAt: new Date(now.getTime() - 64 * 3600000) } });
  const ann3 = await db.announcement.create({ data: { companyId: company.id, title: "Updated Information Security Policy", body: "The Information Security Policy has been revised (v3.2). All employees must read and acknowledge the updated policy. Mandatory training will follow next week.", level: "COMPANY", category: "POLICY", priority: "CRITICAL", requiresAck: true, publishedAt: new Date(now.getTime() - 12 * 3600000) } });
  await db.announcement.create({ data: { companyId: company.id, title: "Quarterly Town Hall — All Hands", body: "Join the quarterly town hall where leadership shares business updates, wins, and the roadmap for next quarter.", level: "COMPANY", category: "EVENT", priority: "NORMAL", requiresAck: false, publishedAt: new Date(now.getTime() - 90 * 3600000) } });
  await db.announcement.create({ data: { companyId: company.id, title: "Annual performance review cycle opens Monday", body: "The annual performance review cycle starts next Monday and runs for three weeks. Self-assessment forms will be available in the Performance module from 9 AM. Please complete your self-review within the first week, including goal progress updates and a short reflection on the year. Managers will then conduct one-on-one calibration discussions before final ratings are submitted to HR. Ratings and calibrated feedback will be visible in your Performance module by the end of the month. Tip: pull up your Insights view first — the task throughput and attendance trends there make writing your self-review much faster.", level: "COMPANY", category: "GENERAL", priority: "IMPORTANT", requiresAck: false, pinned: true, publishedAt: new Date(now.getTime() - 8 * 3600000) } });
  await db.announcementAck.create({ data: { announcementId: ann1.id, employeeId: rohitId, ackedAt: new Date(now.getTime() - 30 * 3600000) } });

  // ── notifications (Rohit) ───────────────────────────────────
  const notifs = [
    { title: "Attendance regularization required", body: "Yesterday's attendance is missing a checkout punch. Regularize to avoid LOP.", type: "ATTENDANCE", link: "attendance", read: false, at: -2 },
    { title: "Document expired: Group Mediclaim Policy Card", body: "This policy lapsed 12 days ago. Raise a helpdesk ticket to HR to get it reissued.", type: "DOCUMENT", link: "documents", read: false, at: -30 },
    { title: "Employee ID Card expires in 24 days", body: "Renew with HR before the deadline to avoid building-access issues.", type: "DOCUMENT", link: "documents", read: false, at: -30.5 },
    { title: "New announcement: Information Security Policy", body: "Critical policy update requires your acknowledgement.", type: "ANNOUNCEMENT", link: "desk", read: false, at: -12 },
    { title: "Task assigned: Verify payroll data before cut-off", body: "Payal Mehta assigned you an urgent task due today 06:00 PM.", type: "TASK", link: "tasks", read: false, at: -5 },
    { title: "Leave request LR-1071 rejected", body: "Anita Desai: Release crunch this sprint, please re-plan.", type: "LEAVE", link: "leave", read: true, at: -192 },
    { title: "Payslip available", body: "Your payslip for last month has been generated.", type: "PAYROLL", link: "payroll", read: true, at: -420 },
    { title: "Expense EX-514 approved by finance", body: "₹850 team dinner reimbursement approved.", type: "EXPENSE", link: "expenses", read: false, at: -24 },
    { title: "Client Meeting — Acme Corp today 02:00 PM", body: "Google Meet with Pooja Reddy", type: "SYSTEM", link: "calendar", read: true, at: -8 },
  ];
  for (const n of notifs) {
    await db.notification.create({ data: { employeeId: rohitId, title: n.title, body: n.body, type: n.type, link: n.link, read: n.read, createdAt: new Date(now.getTime() + n.at * 3600000) } });
  }
  // notifications for manager/HR
  await db.notification.create({ data: { employeeId: anitaId, title: "Leave request LR-1082 awaiting your approval", body: "Rohit Patel — Earned Leave, 2 days", type: "APPROVAL", link: "approvals", read: false, createdAt: new Date(now.getTime() - 3 * 3600000) } });
  await db.notification.create({ data: { employeeId: anitaId, title: "WFH request DR-209 awaiting your approval", body: "Amit Trivedi — 2 days from now", type: "APPROVAL", link: "approvals", read: false, createdAt: new Date(now.getTime() - 2 * 3600000) } });
  await db.notification.create({ data: { employeeId: payalId, title: "Timesheet week awaiting HR review", body: "3 employees submitted weekly timesheets", type: "APPROVAL", link: "approvals", read: false, createdAt: new Date(now.getTime() - 30 * 3600000) } });

  // ── goals ───────────────────────────────────────────────────
  const goals = [
    { title: "Revenue Dashboard v2", desc: "Ship self-serve analytics for sales leadership", cat: "DELIVERABLE", metric: "Completion", target: 100, cur: 75, due: addDays(today, 30), st: "ACTIVE" },
    { title: "Automation Project — CI pipeline", desc: "Reduce deploy time from 25 to 8 minutes", cat: "PROCESS", metric: "Deploy time", target: 8, cur: 14, unit: "min", due: addDays(today, 45), st: "ACTIVE" },
    { title: "AWS Solutions Architect Certification", desc: "Complete associate certification", cat: "LEARNING", metric: "Progress", target: 100, cur: 100, due: addDays(today, -3), st: "COMPLETED" },
    { title: "Mentor junior developers", desc: "Structured weekly pairing with Varun and Farah", cat: "PROCESS", metric: "Sessions", target: 12, cur: 4, unit: "sessions", due: addDays(today, 60), st: "AT_RISK" },
  ];
  for (const g of goals) {
    await db.goal.create({ data: { employeeId: rohitId, title: g.title, description: g.desc, category: g.cat, metric: g.metric, target: g.target, current: g.cur, unit: g.unit ?? "%", dueDate: g.due, status: g.st, quarter: `Q${Math.floor((curMonth) / 3) + 1}` } });
  }

  // ── assets ──────────────────────────────────────────────────
  await db.asset.create({ data: { employeeId: rohitId, name: "MacBook Pro 14\" M3", code: "LP-1024", category: "IT", assignedAt: addDays(today, -380) } });
  await db.asset.create({ data: { employeeId: rohitId, name: "Access Card", code: "AC-5578", category: "FACILITIES", assignedAt: addDays(today, -380) } });
  await db.asset.create({ data: { employeeId: employees["NISS006"].id, name: "Dell Latitude 5440", code: "LP-1180", category: "IT", assignedAt: addDays(today, -200) } });

  // ── audit logs ──────────────────────────────────────────────
  await db.auditLog.createMany({
    data: [
      { actorId: rohitId, actorName: "Rohit Patel", action: "ATTENDANCE_CHECK_IN", entity: "AttendanceDay", entityId: rohitToday.id, details: "Checked in via Web", createdAt: rohitToday.firstCheckIn ?? now },
      { actorId: anitaId, actorName: "Anita Desai", action: "LEAVE_APPROVED", entity: "LeaveRequest", entityId: "LR-1088", details: "Approved Rahul Joshi sick leave", createdAt: new Date(now.getTime() - 2 * 3600000) },
      { actorId: rohitId, actorName: "Rohit Patel", action: "PROFILE_VIEWED", entity: "Employee", entityId: rohitId, createdAt: new Date(now.getTime() - 50 * 3600000) },
      { actorId: payalId, actorName: "Payal Mehta", action: "ANNOUNCEMENT_PUBLISHED", entity: "Announcement", entityId: ann3.id, details: "Security policy v3.2", createdAt: new Date(now.getTime() - 12 * 3600000) },
    ],
  });

  console.log("✅ Seed complete.");
  console.log("   Employee:  rohit.patel@niss.tech / demo123");
  console.log("   Manager:   anita.desai@niss.tech / demo123");
  console.log("   HR:        payal.mehta@niss.tech / demo123");
  console.log("   Admin:     vikram.shah@niss.tech / demo123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
