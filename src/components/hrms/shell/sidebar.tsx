"use client";

import { useHrmsStore } from "@/lib/hrms/store";
import { MAIN_NAV, MANAGER_NAV } from "./nav-config";
import { cn } from "@/lib/utils";
import { ChevronsLeft } from "lucide-react";

export function Sidebar() {
  const { view, setView, employee, sidebarCollapsed, toggleSidebar } = useHrmsStore();
  const manager = employee?.role === "MANAGER" || employee?.role === "HR" || employee?.role === "ADMIN";

  return (
    <aside
      className={cn(
        "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex",
        sidebarCollapsed ? "w-[64px]" : "w-56"
      )}
    >
      <nav className="flex-1 overflow-y-auto scroll-thin px-2.5 py-3" aria-label="Primary">
        <ul className="space-y-0.5">
          {MAIN_NAV.map((item) => (
            <li key={item.key}>
              <button
                onClick={() => setView(item.key)}
                aria-current={view === item.key ? "page" : undefined}
                title={sidebarCollapsed ? item.label : undefined}
                className={cn(
                  "focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  view === item.key
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-muted hover:text-foreground",
                  sidebarCollapsed && "justify-center px-0"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            </li>
          ))}
        </ul>

        {manager ? (
          <div className="mt-4">
            {!sidebarCollapsed ? (
              <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Manager
              </p>
            ) : (
              <div className="mx-auto my-2 h-px w-8 bg-border" />
            )}
            <ul className="space-y-0.5">
              {MANAGER_NAV.map((item) => (
                <li key={item.key}>
                  <button
                    onClick={() => setView(item.key)}
                    aria-current={view === item.key ? "page" : undefined}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      "focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      view === item.key
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-muted hover:text-foreground",
                      sidebarCollapsed && "justify-center px-0"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-border p-2.5">
        <button
          onClick={toggleSidebar}
          className="focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronsLeft className={cn("h-4 w-4 transition-transform", sidebarCollapsed && "rotate-180")} />
          {!sidebarCollapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
