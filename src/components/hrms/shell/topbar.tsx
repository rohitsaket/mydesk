"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet, apiPost } from "@/lib/hrms/client";
import type { NotificationItem } from "@/lib/hrms/types";
import { relativeTime } from "@/lib/hrms/time";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Initials } from "@/components/hrms/shared";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, HelpCircle, LogOut, Moon, Plus, Search, Settings, Sun, UserRound, Monitor } from "lucide-react";
import { QUICK_CREATE_ACTIONS } from "./nav-config";
import type { ViewKey } from "@/lib/hrms/types";
import { useState } from "react";
import { CommandPalette } from "./command-palette";
import { apiPost as post } from "@/lib/hrms/client";

export function Topbar() {
  const { employee, setEmployee, setView, navigate, setCommandOpen, setAuthResolved } = useHrmsStore();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const router = useRouter();

  const notifQuery = useQuery({
    queryKey: ["notifications", "topbar"],
    queryFn: () => apiGet<{ items: NotificationItem[]; unread: number }>("/api/notifications"),
    refetchInterval: 60_000,
  });

  const today = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Calcutta", weekday: "short", day: "numeric", month: "short", year: "numeric",
  }).format(new Date());

  async function logout() {
    try {
      await post("/api/auth/logout");
    } finally {
      setEmployee(null);
      setAuthResolved(false);
      queryClient.clear();
      router.refresh();
      toast.success("Signed out", { description: "See you tomorrow!" });
    }
  }

  async function markAllRead() {
    try {
      await apiPost("/api/notifications", { action: "read-all" });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      toast.error("Could not mark notifications as read.");
    }
  }

  const notifs = notifQuery.data?.items.slice(0, 6) ?? [];
  const unread = notifQuery.data?.unread ?? 0;

  return (
    <header className="sticky top-0 z-40 h-14 shrink-0 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-full items-center gap-2 px-3 sm:gap-3 sm:px-4">
        {/* logo (mobile) */}
        <button className="focus-ring flex items-center gap-2 md:hidden" onClick={() => setView("desk")} aria-label="My Desk home">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">N</div>
        </button>
        <div className="hidden items-center gap-2 md:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">N</div>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold text-foreground">My Desk</p>
            <p className="text-[10px] text-muted-foreground">NISS HRMS</p>
          </div>
        </div>

        {/* global search trigger */}
        <button
          onClick={() => setCommandOpen(true)}
          className="focus-ring ml-1 hidden h-9 w-64 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex lg:w-80"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search employees, pages, requests…</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:block">⌘K</kbd>
        </button>
        <button
          onClick={() => setCommandOpen(true)}
          className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        <span className="hidden text-xs font-medium text-muted-foreground xl:block tabular">{today}</span>

        {/* quick create */}
        <div className="relative">
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setQuickOpen((v) => !v)} aria-expanded={quickOpen}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create</span>
          </Button>
          {quickOpen ? (
            <>
              <button className="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onClick={() => setQuickOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-popover p-1.5 shadow-lg">
                {QUICK_CREATE_ACTIONS.map((a) => (
                  <button
                    key={a.preset}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-accent"
                    onClick={() => {
                      setQuickOpen(false);
                      navigate(a.view as ViewKey, a.preset);
                    }}
                  >
                    <a.icon className="h-4 w-4 text-muted-foreground" />
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* help */}
        <button
          className="focus-ring hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
          aria-label="Help"
          onClick={() => navigate("helpdesk")}
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {/* theme toggle */}
        <button
          className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          title={theme === "dark" ? "Switch to light" : theme === "light" ? "Switch to system" : "Switch to dark"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : theme === "light" ? <Monitor className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* notifications */}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <button
              className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
            >
              <Bell className="h-4 w-4" />
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground tabular">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              {unread > 0 ? (
                <button className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={markAllRead}>
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto scroll-thin">
              {notifs.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">You're all caught up.</p>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/60",
                      !n.read && "bg-accent/40"
                    )}
                    onClick={async () => {
                      setNotifOpen(false);
                      try {
                        await apiPost("/api/notifications", { action: "read", id: n.id });
                        queryClient.invalidateQueries({ queryKey: ["notifications"] });
                      } catch { /* silent */ }
                      if (n.link) setView(n.link as ViewKey);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {!n.read ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : <span className="h-1.5 w-1.5 shrink-0" />}
                      <span className={cn("truncate text-[13px]", n.read ? "font-normal text-foreground/80" : "font-medium text-foreground")}>{n.title}</span>
                    </span>
                    {n.body ? <span className="line-clamp-2 pl-3.5 text-xs text-muted-foreground">{n.body}</span> : null}
                    <span className="pl-3.5 text-[10px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                  </button>
                ))
              )}
            </div>
            <button
              className="w-full border-t border-border px-3 py-2.5 text-center text-xs font-medium text-primary hover:bg-accent"
              onClick={() => { setNotifOpen(false); setView("notifications"); }}
            >
              View all notifications
            </button>
          </PopoverContent>
        </Popover>

        {/* profile menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="focus-ring flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-muted" aria-label="Account menu">
              {employee ? <Initials first={employee.firstName} last={employee.lastName} size="sm" /> : null}
              <div className="hidden leading-tight lg:block">
                <p className="text-[13px] font-medium text-foreground">{employee?.fullName}</p>
                <p className="text-[10px] text-muted-foreground">{employee?.designation}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium text-foreground">{employee?.fullName}</p>
              <p className="text-xs text-muted-foreground">{employee?.email}</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {employee?.role} · {employee?.empCode}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView("profile")}>
              <UserRound className="mr-2 h-4 w-4" /> My Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setView("settings")}>
              <Settings className="mr-2 h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette />
    </header>
  );
}
