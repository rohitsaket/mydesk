"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/hrms/client";
import { PageHeader, DataState, SectionCard } from "@/components/hrms/shared";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Settings, Sun, Moon, Monitor, Clock, Eye, Bell, LogOut, Loader2, Laptop, CheckCircle2,
} from "lucide-react";
import { useHrmsStore } from "@/lib/hrms/store";
import { fmtDate } from "@/lib/hrms/time";

interface SettingsData {
  theme: string;
  timeFormat: string;
  dateOfBirthPublic: boolean;
  notifPrefs: { notifEmail: boolean; notifAnnouncement: boolean; notifWeekly: boolean };
  sessions: { id: string; createdAt: string; expiresAt: string; current: boolean; device: string }[];
}

function ToggleRow({
  id, label, description, checked, onCheckedChange, disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

function ThemeOption({
  value, label, icon,
}: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <Label
      htmlFor={`theme-${value}`}
      className="flex flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-border p-2.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-[[data-state=checked]]:text-primary"
    >
      <RadioGroupItem value={value} id={`theme-${value}`} className="sr-only" />
      {icon}
      {label}
    </Label>
  );
}

export default function SettingsView() {
  const { setTheme } = useTheme();
  const setTimeFormat = useHrmsStore((s) => s.setTimeFormat);
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsData>("/api/settings"),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPatch<SettingsData>("/api/settings", payload),
    onMutate: (payload) => {
      const previous = queryClient.getQueryData<SettingsData>(["settings"]);
      queryClient.setQueryData<SettingsData>(["settings"], (old) => {
        if (!old) return old;
        return {
          ...old,
          theme: typeof payload.theme === "string" ? payload.theme : old.theme,
          timeFormat: typeof payload.timeFormat === "string" ? payload.timeFormat : old.timeFormat,
          dateOfBirthPublic:
            typeof payload.dateOfBirthPublic === "boolean" ? payload.dateOfBirthPublic : old.dateOfBirthPublic,
          notifPrefs: payload.notifPrefs ? { ...old.notifPrefs, ...(payload.notifPrefs as Record<string, boolean>) } : old.notifPrefs,
        };
      });
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["settings"], context.previous);
      toast.error(err instanceof ApiError ? err.message : "Could not save setting");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiPost<{ loggedOut: boolean }>("/api/auth/logout"),
    onSuccess: () => {
      toast.success("Signed out");
      setTimeout(() => window.location.reload(), 400);
    },
    onError: () => {
      toast.error("Sign out failed — try again");
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        subtitle="Appearance, privacy and account preferences"
        icon={<Settings className="h-4.5 w-4.5" />}
      />

      <DataState query={settingsQuery}>
        {(data) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* appearance */}
            <SectionCard title="Appearance" icon={<Sun className="h-4 w-4" />}>
              <p className="mb-2.5 text-xs text-muted-foreground">Theme applies instantly across My Desk.</p>
              <RadioGroup
                value={data.theme}
                onValueChange={(value) => {
                  setTheme(value);
                  saveMutation.mutate({ theme: value });
                  toast.success(`Theme set to ${value}`);
                }}
                className="flex gap-2"
                disabled={saveMutation.isPending}
              >
                <ThemeOption value="light" label="Light" icon={<Sun className="h-4 w-4" />} />
                <ThemeOption value="dark" label="Dark" icon={<Moon className="h-4 w-4" />} />
                <ThemeOption value="system" label="System" icon={<Monitor className="h-4 w-4" />} />
              </RadioGroup>
            </SectionCard>

            {/* time format */}
            <SectionCard title="Time Format" icon={<Clock className="h-4 w-4" />}>
              <p className="mb-2.5 text-xs text-muted-foreground">
                Clocks, punches and schedules re-render immediately.
              </p>
              <RadioGroup
                value={data.timeFormat}
                onValueChange={(value) => {
                  const fmt = value === "24h" ? "24h" : "12h";
                  setTimeFormat(fmt);
                  saveMutation.mutate({ timeFormat: fmt });
                  toast.success(`Time format set to ${fmt === "12h" ? "12-hour" : "24-hour"} clock`);
                }}
                className="flex gap-2"
                disabled={saveMutation.isPending}
              >
                <Label
                  htmlFor="fmt-12h"
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border p-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-[[data-state=checked]]:text-primary"
                >
                  <RadioGroupItem value="12h" id="fmt-12h" className="sr-only" />
                  12-hour (2:30 PM)
                </Label>
                <Label
                  htmlFor="fmt-24h"
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border p-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-[[data-state=checked]]:text-primary"
                >
                  <RadioGroupItem value="24h" id="fmt-24h" className="sr-only" />
                  24-hour (14:30)
                </Label>
              </RadioGroup>
            </SectionCard>

            {/* privacy */}
            <SectionCard title="Privacy" icon={<Eye className="h-4 w-4" />}>
              <ToggleRow
                id="dob-public"
                label="Show my birthday to colleagues"
                description="Birthday appears in desk celebrations for teammates."
                checked={data.dateOfBirthPublic}
                onCheckedChange={(v) => {
                  saveMutation.mutate({ dateOfBirthPublic: v });
                  toast.success(v ? "Birthday visibility on" : "Birthday hidden from colleagues");
                }}
                disabled={saveMutation.isPending}
              />
            </SectionCard>

            {/* notifications */}
            <SectionCard title="Notifications" icon={<Bell className="h-4 w-4" />}>
              <div className="divide-y divide-border">
                <ToggleRow
                  id="notif-email"
                  label="Email on approvals"
                  description="Get an email when a request you raised is approved or rejected."
                  checked={data.notifPrefs.notifEmail}
                  onCheckedChange={(v) => {
                    saveMutation.mutate({ notifPrefs: { notifEmail: v } });
                    toast.success("Notification preference saved");
                  }}
                  disabled={saveMutation.isPending}
                />
                <ToggleRow
                  id="notif-announcement"
                  label="Email on announcements"
                  description="Receive company announcements by email."
                  checked={data.notifPrefs.notifAnnouncement}
                  onCheckedChange={(v) => {
                    saveMutation.mutate({ notifPrefs: { notifAnnouncement: v } });
                    toast.success("Notification preference saved");
                  }}
                  disabled={saveMutation.isPending}
                />
                <ToggleRow
                  id="notif-weekly"
                  label="Weekly summary email"
                  description="Monday digest of your attendance, tasks and pending items."
                  checked={data.notifPrefs.notifWeekly}
                  onCheckedChange={(v) => {
                    saveMutation.mutate({ notifPrefs: { notifWeekly: v } });
                    toast.success("Notification preference saved");
                  }}
                  disabled={saveMutation.isPending}
                />
              </div>
            </SectionCard>

            {/* session */}
            <SectionCard title="Session" icon={<Laptop className="h-4 w-4" />} className="lg:col-span-2">
              <p className="mb-3 text-xs text-muted-foreground">
                You are signed in on {data.sessions.length} device{data.sessions.length === 1 ? "" : "s"}. Sessions expire after 7 days.
              </p>
              <div className="max-h-56 space-y-2 overflow-y-auto scroll-thin pr-1">
                {data.sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {s.current ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {s.device}
                          {s.current ? (
                            <Badge variant="outline" className="ml-1.5 bg-success-soft text-[10px] text-success">This device</Badge>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Signed in {fmtDate(s.createdAt)} · expires {fmtDate(s.expiresAt)}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{s.id}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  className="h-8 gap-1.5 border-danger/40 text-xs text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                  {logoutMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                  Sign out
                </Button>
              </div>
            </SectionCard>
          </div>
        )}
      </DataState>
    </div>
  );
}
