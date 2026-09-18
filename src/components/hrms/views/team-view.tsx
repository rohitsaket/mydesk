"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/hrms/client";
import {
  PageHeader, DataState, EmptyState, Initials, StatCard, StatusBadge,
} from "@/components/hrms/shared";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Users, RefreshCw, Clock, Coffee, Plane, Home, UserX, CalendarDays } from "lucide-react";
import { useHrmsStore } from "@/lib/hrms/store";
import { fmtDate, fmtDuration, fmtTime } from "@/lib/hrms/time";

interface TeamMember {
  id: string;
  empCode: string;
  name: string;
  designation: string;
  department: string | null;
  state: string;
  status: string;
  statusLabel: string;
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  workedMinutes: number;
  breakMinutes: number;
  shiftName: string;
  overtimeMinutes: number;
  badge: { status: string; label: string };
}

interface TeamData {
  date: string;
  members: TeamMember[];
  summary: {
    total: number;
    working: number;
    onBreak: number;
    leave: number;
    wfh: number;
    notCheckedIn: number;
    checkedOut: number;
    avgMinutes: number;
  };
}

export default function TeamView() {
  const employee = useHrmsStore((s) => s.employee);
  const timeFormat = useHrmsStore((s) => s.timeFormat);
  const isManager = employee?.role === "MANAGER" || employee?.role === "HR" || employee?.role === "ADMIN";

  const teamQuery = useQuery({
    queryKey: ["team"],
    queryFn: () => apiGet<TeamData>("/api/team"),
    refetchInterval: 60_000,
    enabled: isManager,
  });

  if (!isManager) {
    return (
      <div className="space-y-4">
        <PageHeader title="My Team" subtitle="Live attendance for your direct reports" icon={<Users className="h-4.5 w-4.5" />} />
        <EmptyState
          title="Team view requires a manager role"
          message="Ask HR if you need reporting-line visibility for your team."
          icon={<UserX className="h-5 w-5" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Team"
        subtitle="Live attendance for your direct reports"
        icon={<Users className="h-4.5 w-4.5" />}
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
              <CalendarDays className="h-3.5 w-3.5" />
              {fmtDate(new Date())}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                void teamQuery.refetch();
                toast.success("Team data refreshed");
              }}
              disabled={teamQuery.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${teamQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <DataState query={teamQuery}>
        {(data) => (
          <div className="space-y-4">
            {/* summary chips */}
            <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
              <StatCard label="Total" value={data.summary.total} icon={<Users className="h-4 w-4" />} />
              <StatCard label="Working" value={data.summary.working} tone="success" icon={<Clock className="h-4 w-4" />} />
              <StatCard label="On Break" value={data.summary.onBreak} tone="warning" icon={<Coffee className="h-4 w-4" />} />
              <StatCard label="Leave" value={data.summary.leave} tone="info" icon={<Plane className="h-4 w-4" />} />
              <StatCard label="WFH" value={data.summary.wfh} tone="info" icon={<Home className="h-4 w-4" />} />
              <StatCard label="Not Checked In" value={data.summary.notCheckedIn} icon={<UserX className="h-4 w-4" />} />
            </div>

            {data.summary.total > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Average worked {fmtDuration(data.summary.avgMinutes)} (checked-in members) · auto-refreshes every 60s
              </p>
            ) : null}

            {/* roster */}
            {data.members.length === 0 ? (
              <EmptyState
                title="No direct reports"
                message="You don't have team members reporting to you yet."
                icon={<Users className="h-5 w-5" />}
              />
            ) : (
              <>
                {/* desktop table */}
                <div className="hidden max-h-[60vh] overflow-y-auto scroll-thin rounded-xl border border-border md:block">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                      <TableRow>
                        <TableHead className="text-xs">Member</TableHead>
                        <TableHead className="text-xs">Department</TableHead>
                        <TableHead className="text-xs">Shift</TableHead>
                        <TableHead className="text-xs">Check-in</TableHead>
                        <TableHead className="text-xs">Check-out</TableHead>
                        <TableHead className="text-xs text-right">Worked</TableHead>
                        <TableHead className="text-xs text-right">Break</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.members.map((m) => {
                        const [firstName, ...rest] = m.name.split(" ");
                        return (
                          <TableRow key={m.id}>
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <Initials first={firstName} last={rest.join(" ") || " "} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                                  <p className="truncate text-[11px] text-muted-foreground">{m.designation}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{m.department ?? "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{m.shiftName}</TableCell>
                            <TableCell className="text-xs tabular">{fmtTime(m.firstCheckIn, timeFormat)}</TableCell>
                            <TableCell className="text-xs tabular">{fmtTime(m.lastCheckOut, timeFormat)}</TableCell>
                            <TableCell className="text-right text-xs tabular">
                              {fmtDuration(m.workedMinutes)}
                              {m.overtimeMinutes > 0 ? (
                                <span className="ml-1 text-[10px] text-success">+{fmtDuration(m.overtimeMinutes)} OT</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular text-muted-foreground">
                              {fmtDuration(m.breakMinutes)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={m.badge.status} label={m.badge.label} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* mobile cards */}
                <div className="max-h-[60vh] space-y-2 overflow-y-auto scroll-thin pr-1 md:hidden">
                  {data.members.map((m) => {
                    const [firstName, ...rest] = m.name.split(" ");
                    return (
                      <div key={m.id} className="rounded-xl border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Initials first={firstName} last={rest.join(" ") || " "} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{m.designation}</p>
                            </div>
                          </div>
                          <StatusBadge status={m.badge.status} label={m.badge.label} />
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                          <span className="text-muted-foreground">
                            Shift <span className="font-medium text-foreground">{m.shiftName}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Dept <span className="font-medium text-foreground">{m.department ?? "—"}</span>
                          </span>
                          <span className="text-muted-foreground">
                            In <span className="font-medium tabular text-foreground">{fmtTime(m.firstCheckIn, timeFormat)}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Out <span className="font-medium tabular text-foreground">{fmtTime(m.lastCheckOut, timeFormat)}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Worked <span className="font-medium tabular text-foreground">{fmtDuration(m.workedMinutes)}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Break <span className="font-medium tabular text-foreground">{fmtDuration(m.breakMinutes)}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </DataState>
    </div>
  );
}
