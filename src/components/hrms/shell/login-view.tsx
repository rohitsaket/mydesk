"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/hrms/client";
import type { LoginResponse } from "@/lib/hrms/types";
import {
  CalendarCheck2, Clock3, FileText, Landmark, Loader2, Lock, Mail,
  ShieldCheck, Sparkles, Wallet, LogIn,
} from "lucide-react";

const DEMO_ACCOUNTS = [
  { label: "Employee", email: "rohit.patel@niss.tech", note: "Senior Developer" },
  { label: "Manager", email: "anita.desai@niss.tech", note: "Engineering Manager" },
  { label: "HR", email: "payal.mehta@niss.tech", note: "HR Manager" },
  { label: "Admin", email: "vikram.shah@niss.tech", note: "Head of IT & Systems" },
];

const FEATURES = [
  { icon: Clock3, text: "Live attendance, breaks & overtime" },
  { icon: CalendarCheck2, text: "Leave, WFH & on-duty workflows" },
  { icon: Wallet, text: "Payroll, payslips & reimbursements" },
  { icon: FileText, text: "Documents & HR service desk" },
  { icon: Landmark, text: "Approvals with full audit trail" },
  { icon: ShieldCheck, text: "Role-based access control" },
];

export function LoginView({ onLogin }: { onLogin: (employee: LoginResponse["employee"], theme: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function doLogin(emailVal: string, passVal: string) {
    if (loading) return;
    setLoading(true);
    try {
      const res = await apiPost<LoginResponse>("/api/auth/login", { email: emailVal, password: passVal });
      toast.success(`Welcome back, ${res.employee.firstName}!`, { description: "Your workday at a glance is ready." });
      onLogin(res.employee, res.theme);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to sign in. Please try again.";
      toast.error("Sign in failed", { description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* ── Brand panel ── */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-[#101828] px-8 py-10 text-white lg:w-[46%] lg:px-14 lg:py-14">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-bold">N</div>
          <div>
            <p className="text-sm font-semibold tracking-wide">NISS HRMS</p>
            <p className="text-xs text-white/60">My Desk</p>
          </div>
        </div>

        <div className="relative mt-12 max-w-md lg:mt-0">
          <Badge variant="outline" className="mb-5 border-white/20 bg-white/10 text-white/90 backdrop-blur">
            <Sparkles className="mr-1 h-3 w-3" /> Employee self-service portal
          </Badge>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Your Workday.<br />One Workspace.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            The complete corporate employee desk — attendance, leave, tasks, payroll,
            expenses and approvals in a single calm, structured place.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-2.5 text-xs text-white/80">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <f.icon className="h-3.5 w-3.5" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-12 flex items-center gap-2 text-[11px] text-white/50 lg:mt-0">
          <ShieldCheck className="h-3.5 w-3.5" />
          Sessions secured with httpOnly cookies · role-based access
        </div>
      </div>

      {/* ── Form panel ── */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">N</div>
              <div>
                <p className="text-sm font-semibold">NISS HRMS — My Desk</p>
                <p className="text-xs text-muted-foreground">Your workday, one workspace.</p>
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Sign in to My Desk</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use your corporate email or employee ID.</p>

          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              doLogin(email, password);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email or Employee ID</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="text"
                  autoComplete="username"
                  placeholder="you@niss.tech"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => toast.info("Contact HR to reset your password.")}>
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <div className="mt-8">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground">Demo accounts</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  className="focus-ring group rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword("demo123");
                    doLogin(acc.email, "demo123");
                  }}
                >
                  <p className="text-xs font-semibold text-foreground group-hover:text-primary">{acc.label}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{acc.note}</p>
                </button>
              ))}
            </div>
            <Card className="mt-4 border-dashed shadow-none">
              <CardContent className="p-3 text-[11px] leading-relaxed text-muted-foreground">
                Password for all demo accounts: <span className="font-mono font-medium text-foreground">demo123</span>.
                Data resets are safe — attendance state machine, approvals and payroll views are fully functional.
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
