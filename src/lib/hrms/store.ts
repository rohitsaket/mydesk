"use client";

import { create } from "zustand";
import type { ViewKey, EmployeeContext } from "./types";

interface QuickCreateState {
  open: boolean;
  preset: string | null;
}

interface HrmsStore {
  view: ViewKey;
  employee: EmployeeContext | null;
  timeFormat: "12h" | "24h";
  serverClockOffsetMs: number;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
  quickCreate: QuickCreateState;
  authResolved: boolean;
  openForm: string | null;
  setView: (v: ViewKey) => void;
  setEmployee: (e: EmployeeContext | null) => void;
  setTimeFormat: (f: "12h" | "24h") => void;
  syncServerTime: (serverTimeMs: number) => void;
  now: () => Date;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  openQuickCreate: (preset?: string) => void;
  closeQuickCreate: () => void;
  setAuthResolved: (v: boolean) => void;
  setOpenForm: (v: string | null) => void;
  navigate: (v: ViewKey, form?: string) => void;
}

export const useHrmsStore = create<HrmsStore>((set, get) => ({
  view: "desk",
  employee: null,
  timeFormat: "12h",
  serverClockOffsetMs: 0,
  sidebarCollapsed: false,
  mobileNavOpen: false,
  commandOpen: false,
  quickCreate: { open: false, preset: null },
  authResolved: false,
  openForm: null,
  setView: (v) => set({ view: v, mobileNavOpen: false, commandOpen: false }),
  setEmployee: (e) => set({ employee: e }),
  setTimeFormat: (f) => set({ timeFormat: f }),
  syncServerTime: (serverTimeMs) => set({ serverClockOffsetMs: Date.now() - serverTimeMs }),
  now: () => new Date(Date.now() - get().serverClockOffsetMs),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  setCommandOpen: (open) => set({ commandOpen: open }),
  openQuickCreate: (preset) => set({ quickCreate: { open: true, preset: preset ?? null } }),
  closeQuickCreate: () => set({ quickCreate: { open: false, preset: null } }),
  setAuthResolved: (v) => set({ authResolved: v }),
  setOpenForm: (v) => set({ openForm: v }),
  navigate: (v, form) => set({ view: v, mobileNavOpen: false, commandOpen: false, openForm: form ?? null }),
}));
