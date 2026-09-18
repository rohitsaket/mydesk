"use client";

import { useHrmsStore } from "@/lib/hrms/store";
import { MOBILE_NAV, MAIN_NAV, MANAGER_NAV } from "./nav-config";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, MoreHorizontal } from "lucide-react";
import { useState } from "react";

export function BottomNav() {
  const { view, setView, employee } = useHrmsStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const manager = ["MANAGER", "HR", "ADMIN"].includes(employee?.role ?? "EMPLOYEE");
  const moreItems = [...MAIN_NAV.filter((n) => !MOBILE_NAV.some((m) => m.key === n.key)), ...(manager ? MANAGER_NAV : [])];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden" aria-label="Mobile navigation">
      <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {MOBILE_NAV.map((item) => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            aria-current={view === item.key ? "page" : undefined}
            className={cn(
              "flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors",
              view === item.key ? "text-primary" : "text-muted-foreground"
            )}
          >
            <item.icon className={cn("h-5 w-5", view === item.key && "scale-105")} />
            <span>{item.label}</span>
          </button>
        ))}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors",
                moreItems.some((m) => m.key === view) ? "text-primary" : "text-muted-foreground"
              )}
              aria-label="More pages"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[70vh] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <SheetHeader className="px-0">
              <SheetTitle className="text-left text-base">All modules</SheetTitle>
            </SheetHeader>
            <div className="mt-2 grid grid-cols-2 gap-1.5 overflow-y-auto scroll-thin">
              {moreItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setView(item.key); setMoreOpen(false); }}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-3 text-left text-sm font-medium transition-colors",
                    view === item.key ? "border-primary/40 bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className={cn("h-4 w-4", view === item.key ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
