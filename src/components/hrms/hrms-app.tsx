"use client";

import { useEffect, useState } from "react";
import { useHrmsStore } from "@/lib/hrms/store";
import { apiGet } from "@/lib/hrms/client";
import type { EmployeeContext } from "@/lib/hrms/types";
import { LoginView } from "@/components/hrms/shell/login-view";
import { AppShell } from "@/components/hrms/shell/app-shell";
import { Loader2 } from "lucide-react";

export function HrmsApp() {
  const { employee, setEmployee, setAuthResolved, setTimeFormat, authResolved } = useHrmsStore();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<{ employee: EmployeeContext; theme: string; timeFormat: "12h" | "24h" }>("/api/auth/me");
        if (!cancelled) {
          setEmployee(res.employee);
          setTimeFormat(res.timeFormat);
        }
      } catch {
        if (!cancelled) setEmployee(null);
      } finally {
        if (!cancelled) {
          setAuthResolved(true);
          setBooting(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [setEmployee, setAuthResolved, setTimeFormat]);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading My Desk…</p>
        </div>
      </div>
    );
  }

  if (!employee || !authResolved) {
    return (
      <LoginView
        onLogin={(emp, theme) => {
          setEmployee(emp);
          setAuthResolved(true);
          if (typeof window !== "undefined" && theme !== "system") {
            document.documentElement.classList.toggle("dark", theme === "dark");
          }
        }}
      />
    );
  }

  return <AppShell />;
}
