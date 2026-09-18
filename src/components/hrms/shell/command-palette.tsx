"use client";

import { useQuery } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet } from "@/lib/hrms/client";
import type { NotificationItem } from "@/lib/hrms/types";
import type { ViewKey } from "@/lib/hrms/types";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useQueryClient } from "@tanstack/react-query";
import { QUICK_CREATE_ACTIONS, VIEW_TITLES } from "./nav-config";
import { ShortcutsHelp, GO_TARGETS } from "./shortcuts-help";
import { apiPost } from "@/lib/hrms/client";
import { useEffect, useRef, useState } from "react";
import { Search, User, FileText, Plus, CornerDownLeft, Keyboard } from "lucide-react";

interface SearchResults {
  employees: { id: string; name: string; designation: string; department: string; empCode: string }[];
  requests: { id: string; code: string; kind: string; detail: string }[];
  tasks: { id: string; title: string; status: string }[];
}

export function CommandPalette() {
  const { commandOpen, setCommandOpen, navigate, employee, setView } = useHrmsStore();
  const [term, setTerm] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const queryClient = useQueryClient();

  // `g`-prefix navigation state (outside useEffect so the handler stays fresh)
  const goPendingRef = useRef<number | null>(null);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    };
    const dialogOpen = () => Boolean(document.querySelector("[role=dialog], [cmdk-root]"));

    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(!useHrmsStore.getState().commandOpen);
        return;
      }
      // shortcut help — "?" (shift+/) when not typing and no dialog open
      if (e.key === "?" && !isTyping(e.target) && !dialogOpen()) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // gmail-style `g` then <key> navigation
      const pending = goPendingRef.current !== null;
      if (pending) {
        window.clearTimeout(goPendingRef.current ?? undefined);
        goPendingRef.current = null;
        const target = GO_TARGETS.find((g) => g.key === e.key.toLowerCase());
        if (target) {
          e.preventDefault();
          navigate(target.view);
        }
        return;
      }
      if (e.key.toLowerCase() === "g" && !isTyping(e.target) && !dialogOpen()) {
        goPendingRef.current = window.setTimeout(() => {
          goPendingRef.current = null;
        }, 900);
      }
    };
    document.addEventListener("keydown", down);
    return () => {
      document.removeEventListener("keydown", down);
      window.clearTimeout(goPendingRef.current ?? undefined);
    };
  }, [setCommandOpen, navigate]);

  const searchQuery = useQuery({
    queryKey: ["search", term],
    queryFn: () => apiGet<SearchResults>(`/api/search?q=${encodeURIComponent(term)}`),
    enabled: commandOpen && term.trim().length >= 2,
  });

  const navPages = Object.entries(VIEW_TITLES).filter(([key]) => {
    const managerOnly = key === "team" || key === "approvals";
    if (managerOnly && !["MANAGER", "HR", "ADMIN"].includes(employee?.role ?? "EMPLOYEE")) return false;
    return true;
  });

  function go(view: ViewKey, form?: string) {
    setCommandOpen(false);
    setTerm("");
    navigate(view, form);
  }

  async function openNotification(id: string) {
    try {
      await apiPost("/api/notifications", { action: "read", id });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch { /* silent */ }
  }

  const results = searchQuery.data;

  return (
    <>
    <CommandDialog open={commandOpen} onOpenChange={(open) => { setCommandOpen(open); if (!open) setTerm(""); }}>
      <CommandInput
        placeholder="Search employees, pages, requests or run an action…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No results found.</CommandEmpty>

        {results && results.employees.length > 0 ? (
          <CommandGroup heading="Employees">
            {results.employees.map((e) => (
              <CommandItem key={e.id} value={`employee ${e.name} ${e.empCode}`} onSelect={() => { go("directory"); }}>
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{e.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{e.designation} · {e.department}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results && results.requests.length > 0 ? (
          <CommandGroup heading="My Requests">
            {results.requests.map((r) => (
              <CommandItem key={r.id} value={`request ${r.code}`} onSelect={() => { go("leave"); }}>
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-xs">{r.code}</span>
                <span className="ml-2 text-xs text-muted-foreground">{r.kind} · {r.detail}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        <CommandGroup heading="Quick Actions">
          {QUICK_CREATE_ACTIONS.map((a) => (
            <CommandItem key={a.preset} value={`action ${a.label}`} onSelect={() => go(a.view as ViewKey, a.preset)}>
              <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
              {a.label}
            </CommandItem>
          ))}
          <CommandItem value="action keyboard shortcuts help" onSelect={() => { setCommandOpen(false); setTerm(""); setShortcutsOpen(true); }}>
            <Keyboard className="mr-2 h-4 w-4 text-muted-foreground" />
            Keyboard shortcuts
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">?</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          {navPages.map(([key, title]) => (
            <CommandItem key={key} value={`page ${title}`} onSelect={() => go(key as ViewKey)}>
              <CornerDownLeft className="mr-2 h-4 w-4 text-muted-foreground" />
              {title}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground flex items-center gap-1.5">
        <Search className="h-3 w-3" />
        Tip: press <kbd className="rounded border border-border bg-muted px-1 font-mono">⌘K</kbd> / <kbd className="rounded border border-border bg-muted px-1 font-mono">Ctrl+K</kbd> anywhere · <kbd className="rounded border border-border bg-muted px-1 font-mono">?</kbd> for shortcuts
      </div>
    </CommandDialog>

    <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
