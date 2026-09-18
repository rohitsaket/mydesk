import type { ViewKey } from "@/lib/hrms/types";
import {
  LayoutDashboard, CalendarClock, CalendarDays, Plane, FileClock, ListChecks,
  Wallet, Receipt, FolderOpen, LifeBuoy, Target, Users, Settings, ClipboardCheck,
  UserCheck, BriefcaseBusiness, Bell, UserRound, BarChart3, Megaphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
  managerOnly?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { key: "desk", label: "My Desk", icon: LayoutDashboard },
  { key: "insights", label: "Insights", icon: BarChart3 },
  { key: "attendance", label: "Attendance", icon: CalendarClock },
  { key: "calendar", label: "My Calendar", icon: CalendarDays },
  { key: "leave", label: "Leave", icon: Plane },
  { key: "timesheet", label: "Timesheet", icon: FileClock },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "payroll", label: "Payroll", icon: Wallet },
  { key: "expenses", label: "Expenses", icon: Receipt },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "helpdesk", label: "Help Desk", icon: LifeBuoy },
  { key: "announcements", label: "Announcements", icon: Megaphone },
  { key: "performance", label: "Performance", icon: Target },
  { key: "directory", label: "Directory", icon: Users },
  { key: "settings", label: "Settings", icon: Settings },
];

export const MANAGER_NAV: NavItem[] = [
  { key: "team", label: "My Team", icon: UserCheck, managerOnly: true },
  { key: "approvals", label: "Approvals", icon: ClipboardCheck, managerOnly: true },
];

export const MOBILE_NAV: NavItem[] = [
  { key: "desk", label: "Desk", icon: LayoutDashboard },
  { key: "attendance", label: "Attendance", icon: CalendarClock },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "helpdesk", label: "Requests", icon: LifeBuoy },
];

export const VIEW_TITLES: Record<ViewKey, string> = {
  desk: "My Desk", insights: "Insights", attendance: "Attendance", shifts: "Shifts", leave: "Leave",
  wfh: "Work From Home", onduty: "On Duty", tasks: "Tasks", timesheet: "Timesheet",
  calendar: "My Calendar", payroll: "Payroll", expenses: "Expenses", documents: "Documents",
  helpdesk: "Help Desk", announcements: "Announcements", requests: "Requests", approvals: "Approvals", team: "My Team",
  directory: "Directory", performance: "Performance", notifications: "Notifications",
  profile: "Profile", settings: "Settings",
};

export const QUICK_CREATE_ACTIONS = [
  { preset: "leave", label: "Apply Leave", view: "leave" as ViewKey, icon: Plane },
  { preset: "regularize", label: "Regularize Attendance", view: "attendance" as ViewKey, icon: CalendarClock },
  { preset: "wfh", label: "Request WFH", view: "wfh" as ViewKey, icon: BriefcaseBusiness },
  { preset: "onduty", label: "On Duty Request", view: "onduty" as ViewKey, icon: BriefcaseBusiness },
  { preset: "timesheet", label: "Add Timesheet", view: "timesheet" as ViewKey, icon: FileClock },
  { preset: "expense", label: "Add Expense", view: "expenses" as ViewKey, icon: Receipt },
  { preset: "ticket", label: "Raise HR Ticket", view: "helpdesk" as ViewKey, icon: LifeBuoy },
];

export { Bell, UserRound };
