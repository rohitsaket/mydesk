// Shared HRMS types used by both client and server.

export type ViewKey =
  | "desk" | "insights" | "attendance" | "shifts" | "leave" | "wfh" | "onduty"
  | "tasks" | "timesheet" | "calendar" | "payroll" | "expenses"
  | "documents" | "helpdesk" | "announcements" | "requests" | "approvals" | "team"
  | "directory" | "performance" | "notifications" | "profile" | "settings";

export interface EmployeeContext {
  id: string;
  empCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  designation: string;
  role: "EMPLOYEE" | "MANAGER" | "HR" | "ADMIN";
  status: string;
  department: string | null;
  departmentId: string | null;
  branch: string | null;
  companyId: string | null;
  companyName: string | null;
  managerName: string | null;
  managerId: string | null;
  dateOfJoining: string;
  dateOfBirth: string | null;
  skills: string[];
}

export interface ShiftInfo {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  graceMinutes: number;
  breakAllowanceMinutes: number;
  requiredMinutes: number;
  crossesMidnight: boolean;
}

export interface BreakEventInfo {
  type: string;
  breakType: string | null;
  timestamp: string;
  endedAt: string | null;
  durationMinutes: number;
}

export interface TimelineEvent {
  id: string;
  type: "CHECK_IN" | "BREAK_START" | "BREAK_END" | "CHECK_OUT";
  label: string;
  timestamp: string;
  breakType?: string | null;
  source?: string | null;
  pending?: boolean;
  label2?: string;
}

export interface AttendanceToday {
  date: string;
  state: "NOT_STARTED" | "WORKING" | "ON_BREAK" | "CHECKED_OUT";
  status: string;
  statusLabel: string;
  serverTime: number;
  firstCheckIn: string | null;
  expectedCheckOut: string | null;
  lastCheckOut: string | null;
  shift: ShiftInfo | null;
  workedMinutes: number;
  breakMinutes: number;
  requiredMinutes: number;
  remainingMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  progressPercent: number;
  currentBreak: { breakType: string; label: string; startedAt: string; durationMinutes: number; exceeded: boolean } | null;
  breaks: BreakEventInfo[];
  timeline: TimelineEvent[];
  source: string | null;
  deviceInfo: string | null;
  warning: string | null;
}

export interface DeskEmployeeBlock extends EmployeeContext {
  avatarInitials: string;
  experienceYears: number;
}

export interface SummaryMetric {
  shift: string;
  requiredMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  remainingMinutes: number;
  overtimeMinutes: number;
}

export interface WeeklyDay {
  date: string;
  dayName: string;
  requiredMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  shortageMinutes: number;
  status: string;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeeklyHours {
  days: WeeklyDay[];
  totals: { requiredMinutes: number; workedMinutes: number; overtimeMinutes: number; shortfallMinutes: number };
}

export interface MonthSummary {
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  late: number;
  wfh: number;
  onDuty: number;
  weeklyOff: number;
  holiday: number;
  missingPunch: number;
  overtimeMinutes: number;
  averageMinutes: number;
  payableDays: number;
}

export interface LeaveBalanceItem {
  leaveTypeId: string;
  name: string;
  code: string;
  color: string;
  entitled: number;
  used: number;
  pending: number;
  available: number;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  project: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED";
  dueAt: string | null;
  assignedBy: string | null;
  progress: number;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  type: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  isToday: boolean;
  timeLabel: string;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  level: string;
  category: string;
  priority: string;
  requiresAck: boolean;
  publishedAt: string;
  acked: boolean;
  acknowledged: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

export interface HolidayItem {
  id: string;
  name: string;
  date: string;
  type: string;
  daysRemaining: number;
}

export interface TeamMemberToday {
  id: string;
  empCode: string;
  name: string;
  designation: string;
  state: string;
  status: string;
  statusLabel: string;
  firstCheckIn: string | null;
  workedMinutes: number;
  shiftName: string;
  avatarInitials: string;
}

export interface ManagerWidgets {
  teamToday: { total: number; working: number; onBreak: number; leave: number; wfh: number; notCheckedIn: number; checkedOut: number };
  pendingApprovals: { leave: number; wfh: number; onDuty: number; attendance: number; timesheet: number; expense: number; total: number };
}

export interface DeskPayload {
  employee: DeskEmployeeBlock;
  attendance: AttendanceToday;
  summary: SummaryMetric;
  weekly: WeeklyHours;
  month: MonthSummary;
  leaveBalances: LeaveBalanceItem[];
  upcomingLeave: { id: string; code: string; leaveType: string; fromDate: string; toDate: string; days: number; status: string } | null;
  tasks: TaskItem[];
  events: UpcomingEvent[];
  announcements: AnnouncementItem[];
  notifications: { unread: number; items: NotificationItem[] };
  nextHoliday: HolidayItem | null;
  birthdays: { id: string; name: string; designation: string; type: "BIRTHDAY" | "ANNIVERSARY"; detail: string; isToday: boolean }[];
  assets: { name: string; code: string }[];
  warnings: { id: string; title: string; message: string; link: string; tone?: "warning" | "danger" }[];
  managerWidgets: ManagerWidgets | null;
  pendingRequests: { leave: number; wfh: number; onDuty: number; regularizations: number; tickets: number };
}

export interface LoginResponse {
  employee: EmployeeContext;
  theme: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

// ── Insights (personal analytics) ─────────────────────
export interface InsightsPayload {
  period: { from: string; to: string };
  attendance: {
    trend: { date: string; label: string; hours: number; ot: number; status: string | null }[];
    distribution: { status: string; count: number }[];
    punctuality: {
      onTimeRate: number;
      avgLateMinutes: number;
      medianArrival: string | null;
      earlyExits: number;
      punchedDays: number;
    };
    streak: number;
    totals: { workedDays: number; avgHours: number; overtimeHours: number };
  };
  tasks: {
    weekly: { week: string; created: number; completed: number }[];
    summary: { total: number; completed: number; open: number; overdue: number; completionRate: number };
  };
  timesheet: {
    projects: { name: string; hours: number; billable: number }[];
    totalHours: number;
    billableRate: number;
  };
  leave: {
    balances: { name: string; color: string; entitled: number; used: number; pending: number; available: number }[];
    totalAvailable: number;
  };
  payroll: { trend: { label: string; net: number }[]; avgNet: number };
  highlights: { tone: "success" | "warning" | "danger" | "info"; text: string }[];
}
