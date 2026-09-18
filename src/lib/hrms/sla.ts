// Helpdesk first-response SLA policy + pure state computation (client & server safe).

/** First-response target hours by ticket priority. */
export const SLA_TARGET_HOURS: Record<string, number> = {
  URGENT: 4,
  HIGH: 8,
  NORMAL: 48,
  LOW: 72,
};

/** Human policy copy per priority. */
export const SLA_TARGET_LABELS: Record<string, string> = {
  URGENT: "4 hours",
  HIGH: "8 hours",
  NORMAL: "2 business days",
  LOW: "3 days",
};

/** An open ticket is AT_RISK when the remaining time drops below this fraction of target. */
const AT_RISK_FRACTION = 0.15;
/** …or below this absolute floor (ms), whichever is larger. */
const AT_RISK_FLOOR_MS = 2 * 3600000;

export type SlaStatus = "ON_TRACK" | "AT_RISK" | "BREACHED" | "MET" | "MISSED";

export interface SlaInput {
  priority: string;
  createdAt: string;
  /** First non-employee comment timestamp (ISO), null while awaiting response. */
  firstResponseAt: string | null;
}

export interface SlaState {
  status: SlaStatus;
  /** ISO timestamp when first response is due (createdAt + target). */
  dueAt: string;
  /** ms until due (negative = overdue); null once responded. */
  remainingMs: number | null;
  /** ms the first response actually took; null while pending. */
  respondedInMs: number | null;
  targetHours: number;
}

/** Derive live SLA state from ticket fields + a reference "now" (Date). */
export function slaState(input: SlaInput, now: Date = new Date()): SlaState {
  const targetHours = SLA_TARGET_HOURS[input.priority] ?? SLA_TARGET_HOURS.NORMAL;
  const createdMs = new Date(input.createdAt).getTime();
  const dueMs = createdMs + targetHours * 3600000;
  const dueAt = new Date(dueMs).toISOString();

  if (input.firstResponseAt) {
    const responseMs = new Date(input.firstResponseAt).getTime();
    const respondedInMs = Math.max(0, responseMs - createdMs);
    return {
      status: respondedInMs <= targetHours * 3600000 ? "MET" : "MISSED",
      dueAt,
      remainingMs: null,
      respondedInMs,
      targetHours,
    };
  }

  const remainingMs = dueMs - now.getTime();
  const atRiskLine = Math.max(targetHours * 3600000 * AT_RISK_FRACTION, AT_RISK_FLOOR_MS);
  return {
    status: remainingMs <= 0 ? "BREACHED" : remainingMs <= atRiskLine ? "AT_RISK" : "ON_TRACK",
    dueAt,
    remainingMs,
    respondedInMs: null,
    targetHours,
  };
}

/** Live countdown label for pending tickets: "Due in 41h 59m" / "Overdue by 5h 20m". */
export function slaCountdownLabel(state: SlaState): string {
  if (state.remainingMs == null) return "";
  const overdue = state.remainingMs < 0;
  return overdue ? `Overdue by ${fmtDurationMs(-state.remainingMs)}` : `Due in ${fmtDurationMs(state.remainingMs)}`;
}

/** Response-time label once answered: "Responded in 2h 14m". */
export function slaResponseLabel(state: SlaState): string {
  if (state.respondedInMs == null) return "";
  return `Responded in ${fmtDurationMs(state.respondedInMs)}`;
}

/** 3600000 → "1h"; 9140000 → "2h 32m"; 190000000 → "2d 6h". */
export function fmtDurationMs(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 48) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh === 0 ? `${d}d` : `${d}d ${hh}h`;
}

/** Server-side summary over a ticket set (open + all, for rates). */
export interface SlaSummary {
  open: number;
  breached: number;
  atRisk: number;
  /** Average first-response hours across responded tickets (1 decimal), null if none. */
  avgFirstResponseHours: number | null;
  /** Met SLA share of responded tickets (0–100), null if none. */
  metRatePct: number | null;
}

export function slaSummary(
  tickets: SlaInput[],
  now: Date = new Date()
): SlaSummary {
  let open = 0, breached = 0, atRisk = 0, met = 0, responded = 0;
  const respondedHours: number[] = [];
  for (const t of tickets) {
    const s = slaState(t, now);
    if (s.respondedInMs != null) {
      responded += 1;
      if (s.status === "MET") met += 1;
      respondedHours.push(s.respondedInMs / 3600000);
    } else {
      open += 1;
      if (s.status === "BREACHED") breached += 1;
      else if (s.status === "AT_RISK") atRisk += 1;
    }
  }
  return {
    open,
    breached,
    atRisk,
    avgFirstResponseHours: responded
      ? Math.round((respondedHours.reduce((a, b) => a + b, 0) / responded) * 10) / 10
      : null,
    metRatePct: responded ? Math.round((met / responded) * 100) : null,
  };
}
