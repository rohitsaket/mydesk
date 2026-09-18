"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet } from "@/lib/hrms/client";
import { fmtTime, addDays, dayIST } from "@/lib/hrms/time";
import {
  PageHeader, SectionCard, EmptyState, DataState, DataSkeleton,
} from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CalendarDays, ChevronLeft, ChevronRight, MapPin, User, Users,
} from "lucide-react";

// ── types ───────────────────────────────────────────────────
interface CalEvent {
  id: string;
  title: string;
  type: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  organizer: string | null;
  attendees: string | null;
}

interface CalendarPayload {
  year: number;
  month: number;
  days: Record<string, CalEvent[]>;
  holidays: { date: string; name: string; type: string }[];
  birthdays: { date: string; name: string; designation: string }[];
  anniversaries: { date: string; name: string; years: number }[];
  upcoming: { date: string; events: CalEvent[] }[];
  today: string;
}

const EVENT_TYPE_META: Record<string, { label: string; color: string }> = {
  MEETING: { label: "Meeting", color: "#2563EB" },
  TRAINING: { label: "Training", color: "#8B5CF6" },
  EVENT: { label: "Event", color: "#F59E0B" },
  HOLIDAY: { label: "Holiday", color: "#10B981" },
  LEAVE: { label: "On Leave", color: "#0EA5E9" },
  TASK: { label: "Task Due", color: "#64748B" },
  PAYROLL: { label: "Payroll", color: "#12B76A" },
  BIRTHDAY: { label: "Birthday", color: "#EC4899" },
  ANNIVERSARY: { label: "Anniversary", color: "#F97316" },
  REVIEW: { label: "Review", color: "#06B6D4" },
};

function typeMeta(type: string): { label: string; color: string } {
  return EVENT_TYPE_META[type] ?? { label: type.replace(/_/g, " "), color: "#64748B" };
}

/** Compact chip label — drop the " — detail" suffix used for celebrations. */
function shortTitle(e: CalEvent): string {
  if (e.type === "BIRTHDAY" || e.type === "ANNIVERSARY") return e.title.split(" — ")[0] ?? e.title;
  return e.title;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_HEADER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── date helpers (UTC-midnight days) ────────────────────────
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayOf(day: Date): Date {
  return addDays(day, -((day.getUTCDay() + 6) % 7));
}

function parseIsoDay(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

// ── main view ───────────────────────────────────────────────
export default function CalendarView() {
  const timeFormat = useHrmsStore((s) => s.timeFormat);
  const today = dayIST();
  const [viewYear, setViewYear] = useState<number>(() => today.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => today.getUTCMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["calendar", viewYear, viewMonth],
    queryFn: () => apiGet<CalendarPayload>(`/api/calendar?year=${viewYear}&month=${viewMonth}`),
    staleTime: 30_000,
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(viewYear, viewMonth - 1 + delta, 1));
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth() + 1);
  };

  const isCurrentMonth = viewYear === today.getUTCFullYear() && viewMonth === today.getUTCMonth() + 1;
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(viewYear, viewMonth - 1, 1)));

  const cells = useMemo(() => {
    const gridStart = mondayOf(new Date(Date.UTC(viewYear, viewMonth - 1, 1)));
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewYear, viewMonth]);

  const monthStats = useMemo(() => {
    const days = query.data?.days ?? {};
    let meetings = 0;
    for (const list of Object.values(days)) meetings += list.filter((e) => e.type === "MEETING").length;
    return {
      meetings,
      holidays: query.data?.holidays.length ?? 0,
      birthdays: query.data?.birthdays.length ?? 0,
      anniversaries: query.data?.anniversaries.length ?? 0,
    };
  }, [query.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Calendar"
        subtitle="Meetings, training, holidays, leave and task due dates"
        icon={<CalendarDays className="h-4.5 w-4.5" />}
        actions={
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[8.5rem] px-1 text-center text-xs font-semibold text-foreground">{monthLabel}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={isCurrentMonth} onClick={() => { setViewYear(today.getUTCFullYear()); setViewMonth(today.getUTCMonth() + 1); }}>
              Today
            </Button>
          </div>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_19rem]">
        <DataState query={query} skeleton={<DataSkeleton />}>
          {(data) => (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-none">
              {/* weekday header */}
              <div className="grid grid-cols-7 border-b border-border bg-muted/40">
                {WEEKDAY_HEADER.map((w) => (
                  <div key={w} className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="hidden sm:inline">{w}</span>
                    <span className="sm:hidden">{w.slice(0, 1)}</span>
                  </div>
                ))}
              </div>

              {/* 6-row month grid, Monday-start */}
              <div className="grid grid-cols-7">
                {cells.map((d) => {
                  const iso = isoDay(d);
                  const inMonth = d.getUTCFullYear() === viewYear && d.getUTCMonth() === viewMonth - 1;
                  const isToday = iso === data.today;
                  const events = data.days[iso] ?? [];
                  const visible = events.slice(0, 3);
                  const more = events.length - visible.length;
                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={!inMonth}
                      onClick={() => inMonth && setSelectedDay(iso)}
                      title={inMonth ? `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} — ${events.length} event${events.length === 1 ? "" : "s"}` : undefined}
                      className={cn(
                        "flex min-h-20 flex-col items-stretch gap-0.5 border-b border-r border-border p-1 text-left transition-colors last:border-r-0 md:min-h-28",
                        inMonth ? "hover:bg-accent/50" : "cursor-default bg-muted/20",
                        isToday && "bg-primary/5 ring-1 ring-inset ring-primary"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold tabular",
                          isToday ? "bg-primary text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground/40"
                        )}>
                          {d.getUTCDate()}
                        </span>
                        {isToday ? <span className="text-[8px] font-bold uppercase text-primary">Today</span> : null}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        {visible.map((e) => {
                          const meta = typeMeta(e.type);
                          return e.type === "HOLIDAY" ? (
                            <span key={e.id} className="block truncate rounded bg-success-soft px-1 py-[1px] text-[10px] font-medium leading-tight text-success">
                              {e.title}
                            </span>
                          ) : (
                            <span key={e.id} className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                              <span className={cn("truncate text-[10px] leading-tight", inMonth ? "text-foreground/80" : "text-muted-foreground/50")}>
                                {shortTitle(e)}
                              </span>
                            </span>
                          );
                        })}
                        {more > 0 ? (
                          <span className="block truncate text-[9px] font-medium text-muted-foreground">+{more} more</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </DataState>

        {/* right rail (lg+) */}
        <DataState query={query} skeleton={<DataSkeleton />}>
          {(data) => (
            <div className="hidden flex-col gap-4 lg:flex">
              <SectionCard title="Upcoming · Next 7 Days" icon={<ChevronRight className="h-3.5 w-3.5 text-primary" />}>
                {data.upcoming.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing scheduled in the next 7 days.</p>
                ) : (
                  <div className="max-h-96 space-y-3 overflow-y-auto scroll-thin pr-1">
                    {data.upcoming.map((u) => {
                      const d = parseIsoDay(u.date);
                      return (
                        <div key={u.date}>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(d)} · {d.getUTCDate()} {MONTHS_SHORT[d.getUTCMonth()]}
                            {u.date === data.today ? <span className="ml-1.5 rounded bg-primary/10 px-1 py-[1px] text-[9px] font-bold uppercase text-primary">Today</span> : null}
                          </p>
                          <div className="mt-1 space-y-1">
                            {u.events.map((e) => {
                              const meta = typeMeta(e.type);
                              return (
                                <div key={e.id} className="flex items-center gap-1.5">
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                                  <span className="truncate text-xs text-foreground">{shortTitle(e)}</span>
                                  <span className="ml-auto shrink-0 text-[10px] tabular text-muted-foreground">
                                    {e.allDay ? "All day" : fmtTime(e.startAt, timeFormat)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Legend">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
                    <span key={key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                      {meta.label}
                    </span>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="This Month">
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="Meetings" value={monthStats.meetings} />
                  <MiniStat label="Holidays" value={monthStats.holidays} />
                  <MiniStat label="Birthdays" value={monthStats.birthdays} />
                  <MiniStat label="Anniversaries" value={monthStats.anniversaries} />
                </div>
              </SectionCard>
            </div>
          )}
        </DataState>
      </div>

      <DayDialog day={selectedDay} data={query.data} timeFormat={timeFormat} onClose={() => setSelectedDay(null)} />
    </div>
  );
}

// ── mini stat (right rail) ──────────────────────────────────
function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border px-2.5 py-2">
      <p className="text-lg font-semibold tabular text-foreground">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

// ── day detail dialog ───────────────────────────────────────
function DayDialog({
  day, data, timeFormat, onClose,
}: {
  day: string | null;
  data: CalendarPayload | undefined;
  timeFormat: "12h" | "24h";
  onClose: () => void;
}) {
  const events = day && data ? (data.days[day] ?? []) : [];
  const title = day
    ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(parseIsoDay(day))
    : "";

  return (
    <Dialog open={!!day} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {events.length === 0 ? "Nothing scheduled for this day." : `${events.length} event${events.length === 1 ? "" : "s"} scheduled`}
          </DialogDescription>
        </DialogHeader>

        {events.length === 0 ? (
          <EmptyState title="Nothing scheduled" message="No meetings, holidays, leave or task due dates on this day." />
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto scroll-thin pr-1">
            {events.map((e) => {
              const meta = typeMeta(e.type);
              return (
                <div key={e.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{e.title}</p>
                        <span
                          className="rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase"
                          style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                        <p className="tabular font-medium text-foreground/80">
                          {e.allDay ? "All day" : `${fmtTime(e.startAt, timeFormat)}${e.endAt ? ` – ${fmtTime(e.endAt, timeFormat)}` : ""}`}
                        </p>
                        {e.location ? (
                          <p className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                            <span className="truncate">{e.location}</span>
                          </p>
                        ) : null}
                        {e.organizer ? (
                          <p className="flex items-center gap-1.5">
                            <User className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                            <span className="truncate">Organized by {e.organizer}</span>
                          </p>
                        ) : null}
                        {e.attendees ? (
                          <p className="flex items-center gap-1.5">
                            <Users className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                            <span className="truncate">{e.attendees}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
