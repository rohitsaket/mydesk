"use client";

import { useQuery } from "@tanstack/react-query";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet } from "@/lib/hrms/client";
import type { NotificationItem } from "@/lib/hrms/types";
import type { ViewKey } from "@/lib/hrms/types";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useQueryClient } from "@tanstack/react-query";
import { QUICK_CREATE_ACTIONS, VIEW_TITLES } from "./nav-config";
import { apiPost } from "@/lib/hrms/client";
import { useEffect, useState } from "react";
import { Search, User, FileText, Plus, CornerDownLeft } from "lucide-react";

interface SearchResults {
  employees: { id: string; name: string; designation: string; department: string; empCode: string }[];
  requests: { id: string; code: string; kind: string; detail: string }[];
  tasks: { id: string; title: string; status: string }[];
}

export function CommandPalette() {
  const { commandOpen, setCommandOpen, navigate, employee, setView } = useHrmsStore();
  const [term, setTerm] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(!useHrmsStore.getState().commandOpen);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setCommandOpen]);

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
        Tip: press <kbd className="rounded border border-border bg-muted px-1 font-mono">⌘K</kbd> / <kbd className="rounded border border-border bg-muted px-1 font-mono">Ctrl+K</kbd> anywhere
      </div>
    </CommandDialog>
  );
}
