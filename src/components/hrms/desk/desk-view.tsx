"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/hrms/client";
import { useHrmsStore } from "@/lib/hrms/store";
import type { DeskPayload } from "@/lib/hrms/types";
import { AttendanceHero } from "./hero-attendance";
import {
  QuickActions, SummaryCards, TodayTimeline, UpcomingPanel,
  WeeklyHours, MyTasksWidget, MonthSummaryWidget, LeaveBalanceWidget,
  AnnouncementsWidget, ManagerWidgetsPanel, WarningBanners,
} from "./widgets";
import { Initials, DataState } from "@/components/hrms/shared";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/hrms/time";

function greetingFor(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DeskView() {
  const { employee } = useHrmsStore();
  const deskQuery = useQuery({
    queryKey: ["desk"],
    queryFn: () => apiGet<DeskPayload>("/api/desk"),
    refetchInterval: 90_000,
  });

  const now = new Date();
  const hour = parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Calcutta", hour: "numeric", hour12: false }).format(now),
    10
  );
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Calcutta", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(now);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── header ── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {employee ? <Initials first={employee.firstName} last={employee.lastName} size="lg" /> : null}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {greetingFor(hour)}, {employee?.firstName} 👋
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {dateLabel} · Here&apos;s your workday at a glance.
            </p>
          </div>
        </div>
        {employee ? (
          <div className="hidden items-center gap-2.5 text-xs text-muted-foreground lg:flex">
            <span className="font-semibold text-foreground">{employee.designation}</span>
            <span aria-hidden>·</span>
            <span>{employee.department}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">{employee.empCode}</span>
            {employee.managerName ? (
              <Badge variant="outline" className="whitespace-nowrap text-[10px] font-normal text-muted-foreground">
                Reports to {employee.managerName}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </header>

      <DataState query={deskQuery}>
        {(data) => (
          <div className="space-y-4 sm:space-y-5">
            <WarningBanners data={data} />

            {/* hero + quick actions */}
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <AttendanceHero />
              </div>
              <QuickActions />
            </div>

            {/* manager widgets */}
            {data.managerWidgets ? <ManagerWidgetsPanel data={data} /> : null}

            {/* summary cards */}
            <SummaryCards data={data} />

            {/* timeline + upcoming */}
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
              <TodayTimeline data={data} />
              <UpcomingPanel data={data} />
            </div>

            {/* weekly hours + tasks */}
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
              <WeeklyHours data={data} />
              <MyTasksWidget data={data} />
            </div>

            {/* month summary + leave */}
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
              <MonthSummaryWidget data={data} />
              <LeaveBalanceWidget data={data} />
            </div>

            {/* announcements */}
            <AnnouncementsWidget data={data} />
          </div>
        )}
      </DataState>
    </div>
  );
}
