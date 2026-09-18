"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/hrms/client";
import { fmtDateShort, dayIST, ORG_TZ, fmtDuration } from "@/lib/hrms/time";
import { PageHeader, SectionCard, StatusBadge, EmptyState, DataState, InfoRow } from "@/components/hrms/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, CalendarRange, AlarmClock, Coffee, CalendarOff, Info, ChevronRight } from "lucide-react";

// ── types ───────────────────────────────────────────────────
interface ShiftInfo {
  id: string; name: string; code: string; startTime: string; endTime: string; shiftType: string;
  graceMinutes: number; breakAllowanceMinutes: number; requiredMinutes: number;
  weeklyOff: string; description: string | null; crossesMidnight: boolean;
}
interface RosterDay {
  date: string; shiftName: string; shiftCode: string; startTime: string; endTime: string;
  shiftType: string; isDefault: boolean;
}
interface ShiftsData { shift: ShiftInfo | null; roster: RosterDay[] }

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SHIFT_TYPE_STYLES: Record<string, string> = {
  FIXED: "bg-muted text-muted-foreground border-border",
  ROTATIONAL: "bg-info-soft text-info border-info/20",
  NIGHT: "bg-danger-soft text-danger border-danger/20",
  FLEXIBLE: "bg-success-soft text-success border-success/20",
  SPLIT: "bg-warning-soft text-[#B54708] border-warning/25",
};

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

function weeklyOffLabel(weeklyOff: string): string {
  const days = weeklyOff.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));
  if (days.length === 0) return "—";
  return days.map((d) => DAY_NAMES[d] ?? "?").join(", ");
}

function nowMinutesIST(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ORG_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return (h % 24) * 60 + m;
}

// ── main view ───────────────────────────────────────────────
export default function ShiftsView() {
  const shiftsQuery = useQuery({
    queryKey: ["shifts"],
    queryFn: () => apiGet<ShiftsData>("/api/shifts"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Shifts"
        subtitle="Your current shift and upcoming roster"
        icon={<Clock className="h-4.5 w-4.5" />}
      />

      <DataState query={shiftsQuery}>
        {(data) => (
          <>
            <CurrentShiftCard shift={data.shift} />
            <RosterCard roster={data.roster} />
          </>
        )}
      </DataState>
    </div>
  );
}

// ── current shift card ──────────────────────────────────────
function CurrentShiftCard({ shift }: { shift: ShiftInfo | null }) {
  if (!shift) {
    return <EmptyState title="No shift assigned" message="Contact HR to get a shift assignment." />;
  }

  const startMin = parseHHMM(shift.startTime);
  const endMin = parseHHMM(shift.endTime);
  const crosses = shift.crossesMidnight;
  const displayEnd = crosses ? endMin + 1440 : endMin;
  const nowMin = nowMinutesIST();

  // 24h track segments (percent of day)
  const segs: { left: number; width: number }[] = [];
  if (crosses) {
    segs.push({ left: (startMin / 1440) * 100, width: ((1440 - startMin) / 1440) * 100 });
    segs.push({ left: 0, width: (endMin / 1440) * 100 });
  } else {
    segs.push({ left: (startMin / 1440) * 100, width: ((endMin - startMin) / 1440) * 100 });
  }
  const inWindow = crosses
    ? nowMin >= startMin || nowMin <= endMin
    : nowMin >= startMin && nowMin <= endMin;

  return (
    <SectionCard title="Current Shift" icon={<AlarmClock className="h-4 w-4 text-primary" />}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{shift.name}</h3>
            <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] font-semibold", SHIFT_TYPE_STYLES[shift.shiftType] ?? SHIFT_TYPE_STYLES.FIXED)}>
              {shift.shiftType}
            </Badge>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-semibold text-muted-foreground">{shift.code}</Badge>
            {inWindow ? <StatusBadge status="WORKING" label="Shift window active" /> : null}
          </div>
          <p className="mt-1 text-2xl font-semibold tabular text-foreground">
            {shift.startTime} → {shift.endTime}
            {crosses ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(+1 day)</span> : null}
          </p>
          {shift.description ? <p className="mt-0.5 text-xs text-muted-foreground">{shift.description}</p> : null}
        </div>
        <div className="grid min-w-[220px] flex-1 gap-x-8 sm:grid-cols-2">
          <div>
            <InfoRow label="Required hours" value={fmtDuration(shift.requiredMinutes)} mono />
            <InfoRow label="Grace period" value={`${shift.graceMinutes} min`} mono />
          </div>
          <div>
            <InfoRow label="Break allowance" value={`${shift.breakAllowanceMinutes} min`} mono />
            <InfoRow label="Weekly off" value={weeklyOffLabel(shift.weeklyOff)} />
          </div>
        </div>
      </div>

      {/* 24h visual bar */}
      <div className="mt-4">
        <div className="relative h-7 w-full overflow-hidden rounded-lg border border-border bg-muted/40">
          {segs.map((s, i) => (
            <div
              key={i}
              className="absolute top-0 h-full bg-primary/85"
              style={{ left: `${s.left}%`, width: `${s.width}%` }}
              title={`Shift window ${shift.startTime}–${shift.endTime}`}
            />
          ))}
          {/* hour grid lines */}
          {[6, 12, 18].map((h) => (
            <div key={h} className="absolute top-0 h-full w-px bg-border" style={{ left: `${(h / 24) * 100}%` }} aria-hidden />
          ))}
          {/* now marker */}
          <div
            className="absolute top-0 h-full w-0.5 bg-danger"
            style={{ left: `${(nowMin / 1440) * 100}%` }}
            title="Current time (IST)"
            aria-label="Current time"
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] tabular text-muted-foreground">
          {["00", "06", "12", "18", "24"].map((h) => <span key={h}>{h}</span>)}
        </div>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3 shrink-0" />
          Shift window across the 24-hour day · red marker is current IST time.
        </p>
      </div>
    </SectionCard>
  );
}

// ── upcoming roster ─────────────────────────────────────────
function RosterCard({ roster }: { roster: RosterDay[] }) {
  const today = useMemo(() => dayIST(new Date()), []);
  const todayIso = today.toISOString().slice(0, 10);
  const changes = roster.filter((r) => !r.isDefault).length;

  return (
    <SectionCard
      title="Upcoming Roster"
      icon={<CalendarRange className="h-4 w-4 text-primary" />}
      action={
        <span className="text-[11px] text-muted-foreground">
          Next 14 days · {changes === 0 ? "no changes from General Shift" : `${changes} change${changes > 1 ? "s" : ""} vs General Shift`}
        </span>
      }
      contentClassName="pt-0"
    >
      {roster.length === 0 ? (
        <EmptyState title="No roster data" message="Your shift roster will appear here once published." />
      ) : (
        <div className="max-h-96 divide-y divide-border overflow-y-auto scroll-thin">
          {roster.map((r) => {
            const d = new Date(r.date);
            const isToday = r.date.slice(0, 10) === todayIso;
            const isWO = r.shiftCode !== "GEN" ? false : d.getUTCDay() === 0;
            return (
              <div
                key={r.date}
                className={cn(
                  "flex items-center gap-3 px-1 py-2.5",
                  !r.isDefault && "rounded-lg bg-warning-soft/60 px-2.5"
                )}
              >
                <div className={cn("w-[86px] shrink-0")}>
                  <p className={cn("text-xs font-semibold", isToday && "text-primary")}>
                    {isToday ? "Today" : fmtDateShort(r.date)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{DAY_NAMES[d.getUTCDay()].slice(0, 3)}{isToday ? " · today" : ""}</p>
                </div>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={cn(
                      "px-1.5 py-0 text-[10px] font-semibold",
                      r.isDefault ? "bg-muted text-muted-foreground border-border" : "bg-warning-soft text-[#B54708] border-warning/25"
                    )}>
                      {r.shiftName}
                    </Badge>
                    {!r.isDefault ? (
                      <span className="rounded-full bg-warning-soft px-1.5 py-[1px] text-[9px] font-semibold text-[#B54708]">Changed</span>
                    ) : null}
                    {isWO ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-[1px] text-[9px] font-semibold text-muted-foreground">
                        <CalendarOff className="h-2.5 w-2.5" /> Weekly off
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium tabular text-foreground">{r.startTime} – {r.endTime}</p>
                  <p className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    <Coffee className="h-2.5 w-2.5" />
                    {r.shiftCode}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
