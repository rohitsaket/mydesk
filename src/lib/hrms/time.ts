// Time / duration formatting helpers shared by client & server.

export const ORG_TZ = "Asia/Calcutta";
const IST_OFFSET_MS = 330 * 60 * 1000;

/** Local (IST) calendar day as UTC-midnight Date. */
export function dayIST(d: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  const [y, m, dd] = parts.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}

export function addDays(day: Date, n: number): Date {
  return new Date(day.getTime() + n * 86400000);
}

export function istTime(day: Date, h: number, m: number): Date {
  return new Date(day.getTime() + h * 3600000 + m * 60000 - IST_OFFSET_MS);
}

/** Parse "HH:MM" → minutes since midnight. */
export function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function shiftEndAbsolute(day: Date, startTime: string, endTime: string): Date {
  const start = parseHHMM(startTime);
  const end = parseHHMM(endTime);
  const crosses = end <= start;
  return istTime(day, Math.floor((crosses ? end + 1440 : end) / 60), (crosses ? end + 1440 : end) % 60);
}

export function shiftStartAbsolute(day: Date, startTime: string): Date {
  const s = parseHHMM(startTime);
  return istTime(day, Math.floor(s / 60), s % 60);
}

// ── display formatting (client-side, IST) ────────────────────
export function fmtTime12(t: string | Date | null | undefined): string {
  if (!t) return "—";
  const d = typeof t === "string" ? new Date(t) : t;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: ORG_TZ, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(d);
}

export function fmtTime24(t: string | Date | null | undefined): string {
  if (!t) return "—";
  const d = typeof t === "string" ? new Date(t) : t;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: ORG_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

export function fmtTime(t: string | Date | null | undefined, format: "12h" | "24h" = "12h"): string {
  return format === "24h" ? fmtTime24(t) : fmtTime12(t);
}

export function fmtDate(t: string | Date | null | undefined): string {
  if (!t) return "—";
  const d = typeof t === "string" ? new Date(t) : t;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ORG_TZ, day: "numeric", month: "short", year: "numeric",
  }).format(d);
}

export function fmtDateShort(t: string | Date | null | undefined): string {
  if (!t) return "—";
  const d = typeof t === "string" ? new Date(t) : t;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ORG_TZ, day: "numeric", month: "short",
  }).format(d);
}

export function fmtDayName(t: string | Date): string {
  const d = typeof t === "string" ? new Date(t) : t;
  return new Intl.DateTimeFormat("en-GB", { timeZone: ORG_TZ, weekday: "long" }).format(d);
}

export function fmtMonthDay(t: string | Date): string {
  const d = typeof t === "string" ? new Date(t) : t;
  return new Intl.DateTimeFormat("en-GB", { timeZone: ORG_TZ, day: "numeric", month: "long" }).format(d);
}

/** 92 → "1h 32m" */
export function fmtDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 92 → "1h 32m 05s" style with seconds */
export function fmtDurationSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/** live timer "05:42:18" */
export function fmtClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function initialsOf(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function fmtINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(amount);
}

export function relativeTime(t: string | Date): string {
  const d = typeof t === "string" ? new Date(t) : t;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDateShort(d);
}

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Not Checked In",
  P: "Present",
  A: "Absent",
  L: "Leave",
  H: "Holiday",
  WO: "Weekly Off",
  WFH: "Work From Home",
  OD: "On Duty",
  HD: "Half Day",
  MP: "Missing Punch",
};

export const BREAK_TYPE_LABELS: Record<string, string> = {
  TEA: "Tea Break",
  LUNCH: "Lunch Break",
  PERSONAL: "Personal Break",
  PRAYER: "Prayer Break",
  OFFICIAL: "Official Break",
  CUSTOM: "Custom Break",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  REVIEW: "Review",
  COMPLETED: "Completed",
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

export function sameDayIST(a: Date, b: Date): boolean {
  return dayIST(a).getTime() === dayIST(b).getTime();
}
