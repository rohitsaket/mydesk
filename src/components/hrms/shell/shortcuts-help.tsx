"use client";

import { useHrmsStore } from "@/lib/hrms/store";
import type { ViewKey } from "@/lib/hrms/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard, ArrowBigRight } from "lucide-react";

/** A single shortcut row: keys + what it does. */
function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((k, i) => (
          <span key={`${k}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <ArrowBigRight className="h-3 w-3 text-muted-foreground/40" aria-hidden /> : null}
            <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground shadow-[0_1px_0_0_var(--border)]">
              {k}
            </kbd>
          </span>
        ))}
      </span>
    </div>
  );
}

const GO_TARGETS: { key: string; view: ViewKey; title: string }[] = [
  { key: "d", view: "desk", title: "Desk" },
  { key: "i", view: "insights", title: "Insights" },
  { key: "a", view: "attendance", title: "Attendance" },
  { key: "c", view: "calendar", title: "Calendar" },
  { key: "l", view: "leave", title: "Leave" },
  { key: "t", view: "tasks", title: "Tasks" },
  { key: "p", view: "payroll", title: "Payroll" },
  { key: "n", view: "notifications", title: "Notifications" },
  { key: "s", view: "settings", title: "Settings" },
];

export { GO_TARGETS };

export function ShortcutsHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useHrmsStore((s) => s.navigate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-4 w-4 text-primary" aria-hidden />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs">
            Navigate faster without the mouse. Shortcuts are ignored while typing in any field.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto scroll-thin pr-1">
          <section aria-labelledby="sc-global">
            <p id="sc-global" className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Global</p>
            <Row keys={["⌘", "K"]} label="Open command palette" />
            <Row keys={["?"]} label="Open this shortcut guide" />
            <Row keys={["Esc"]} label="Close dialogs and menus" />
          </section>

          <section aria-labelledby="sc-go" className="mt-3">
            <p id="sc-go" className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Jump to a view — press <span className="font-mono text-foreground">g</span> then a key
            </p>
            {GO_TARGETS.map((g) => (
              <Row key={g.key} keys={["g", g.key]} label={g.title} />
            ))}
          </section>
        </div>

        <div className="mt-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-[11px] font-medium text-muted-foreground">Try it — jump straight to a module:</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {GO_TARGETS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  navigate(g.view);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-primary focus-ring"
              >
                <span className="font-mono text-[10px] text-muted-foreground">{g.key}</span>
                {g.title}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
