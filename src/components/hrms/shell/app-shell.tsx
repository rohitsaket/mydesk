"use client";

import dynamic from "next/dynamic";
import { useHrmsStore } from "@/lib/hrms/store";
import { Topbar } from "./topbar";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { DeskView } from "@/components/hrms/desk/desk-view";
import { DataSkeleton } from "@/components/hrms/shared";

const loading = () => <DataSkeleton />;

const InsightsView = dynamic(() => import("../views/insights-view"), { loading });
const AttendanceView = dynamic(() => import("../views/attendance-view"), { loading });
const ShiftsView = dynamic(() => import("../views/shifts-view"), { loading });
const LeaveView = dynamic(() => import("../views/leave-view"), { loading });
const WfhView = dynamic(() => import("../views/wfh-view"), { loading });
const OnDutyView = dynamic(() => import("../views/onduty-view"), { loading });
const TasksView = dynamic(() => import("../views/tasks-view"), { loading });
const TimesheetView = dynamic(() => import("../views/timesheet-view"), { loading });
const CalendarView = dynamic(() => import("../views/calendar-view"), { loading });
const NotificationsView = dynamic(() => import("../views/notifications-view"), { loading });
const PayrollView = dynamic(() => import("../views/payroll-view"), { loading });
const ExpensesView = dynamic(() => import("../views/expenses-view"), { loading });
const DocumentsView = dynamic(() => import("../views/documents-view"), { loading });
const HelpdeskView = dynamic(() => import("../views/helpdesk-view"), { loading });
const AnnouncementsView = dynamic(() => import("../views/announcements-view"), { loading });
const DirectoryView = dynamic(() => import("../views/directory-view"), { loading });
const PerformanceView = dynamic(() => import("../views/performance-view"), { loading });
const ProfileView = dynamic(() => import("../views/profile-view"), { loading });
const SettingsView = dynamic(() => import("../views/settings-view"), { loading });
const TeamView = dynamic(() => import("../views/team-view"), { loading });
const ApprovalsView = dynamic(() => import("../views/approvals-view"), { loading });

export function AppShell() {
  const { view } = useHrmsStore();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Topbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0" role="main">
          <div className="mx-auto w-full max-w-[1440px] flex-1 space-y-4 p-3 sm:space-y-5 sm:p-4 lg:p-6">
            {view === "desk" ? <DeskView /> : null}
            {view === "insights" ? <InsightsView /> : null}
            {view === "attendance" ? <AttendanceView /> : null}
            {view === "shifts" ? <ShiftsView /> : null}
            {view === "leave" ? <LeaveView /> : null}
            {view === "wfh" ? <WfhView /> : null}
            {view === "onduty" ? <OnDutyView /> : null}
            {view === "tasks" ? <TasksView /> : null}
            {view === "timesheet" ? <TimesheetView /> : null}
            {view === "calendar" ? <CalendarView /> : null}
            {view === "notifications" ? <NotificationsView /> : null}
            {view === "payroll" ? <PayrollView /> : null}
            {view === "expenses" ? <ExpensesView /> : null}
            {view === "documents" ? <DocumentsView /> : null}
            {view === "helpdesk" ? <HelpdeskView /> : null}
            {view === "announcements" ? <AnnouncementsView /> : null}
            {view === "directory" ? <DirectoryView /> : null}
            {view === "performance" ? <PerformanceView /> : null}
            {view === "profile" ? <ProfileView /> : null}
            {view === "settings" ? <SettingsView /> : null}
            {view === "team" ? <TeamView /> : null}
            {view === "approvals" ? <ApprovalsView /> : null}
          </div>
          <footer className="border-t border-border bg-background">
            <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-between gap-1.5 px-4 py-4 text-[11px] text-muted-foreground sm:flex-row lg:px-6">
              <p>NISS HRMS — My Desk · Your workday, one workspace.</p>
              <p className="tabular">All times shown in IST · Server-authoritative attendance</p>
            </div>
          </footer>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
