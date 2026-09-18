"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageHeader, SectionCard, StatusBadge, DataState, DataSkeleton, InfoRow, EmptyState,
} from "@/components/hrms/shared";
import { apiGet } from "@/lib/hrms/client";
import { fmtDate, fmtDateShort, fmtINR } from "@/lib/hrms/time";
import { useHrmsStore } from "@/lib/hrms/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Wallet, CalendarDays, FileText, History, Landmark, Download, Info,
  CircleCheck, TriangleAlert, Clock, ArrowRight, Building2,
} from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── types (API contract) ─────────────────────────────────────
interface PayslipSummary {
  id: string;
  periodId: string;
  month: number;
  year: number;
  status: string;
  gross: number;
  deductions: number;
  net: number;
  payableDays: number;
  lopDays: number;
  overtimeHours: number;
  generatedAt: string;
}

interface PayrollList {
  current: { periodId: string; month: number; year: number; status: string; payDate: string } | null;
  payslips: PayslipSummary[];
  nextPayDate: string | null;
  taxRegime: string;
}

interface PayslipLine {
  label: string;
  amount: number;
}

interface PayslipDetail {
  payslip: {
    id: string; month: number; year: number; status: string;
    gross: number; deductions: number; net: number;
    payableDays: number; lopDays: number; overtimeHours: number;
    earnings: PayslipLine[]; deductionLines: PayslipLine[];
    generatedAt: string;
  };
  period: { month: number; year: number; status: string; payDate: string };
  employee: {
    name: string; empCode: string; designation: string;
    department: string; company: string;
  };
}

function monthLabel(month: number, year: number): string {
  return `${MONTHS[Math.min(Math.max(month, 1), 12) - 1]} ${year}`;
}

function periodBadge(status: string) {
  if (status === "PROCESSING") {
    return <StatusBadge status="PROCESSING" label="Processing" className="border-warning/25 bg-warning-soft text-[#B54708]" />;
  }
  if (status === "PROCESSED") {
    return <StatusBadge status="PROCESSED" label="Processed" className="border-info/20 bg-info-soft text-info" />;
  }
  return <StatusBadge status={status} label={status === "PAID" ? "Paid" : status} />;
}

/** previous financial-year label, e.g. Sep 2026 → "FY 2025-26" */
function prevFYLabel(now: Date): string {
  const y = now.getUTCFullYear();
  const startYear = now.getUTCMonth() + 1 >= 4 ? y : y - 1;
  return `FY ${startYear - 1}-${String(startYear % 100).padStart(2, "0")}`;
}

// ── main view ────────────────────────────────────────────────
export default function PayrollView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["payroll"], queryFn: () => apiGet<PayrollList>("/api/payroll") });

  return (
    <div className="space-y-4">
      <PageHeader title="Payroll" subtitle="Compensation & payslips" icon={<Wallet className="h-4.5 w-4.5" />} />
      <DataState query={query} skeleton={<DataSkeleton />}>
        {(data) => (
          <>
            <CurrentPeriodCard data={data} />
            {data.payslips.length > 0 ? (
              <LatestPayslipCard latest={data.payslips[0]} onView={() => setSelectedId(data.payslips[0].id)} />
            ) : (
              <EmptyState
                title="No payslips yet"
                message="Your payslips will appear here once the first payroll cycle is processed."
              />
            )}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <HistoryCard payslips={data.payslips} onView={setSelectedId} />
              </div>
              <TaxCard taxRegime={data.taxRegime} />
            </div>
          </>
        )}
      </DataState>
      {selectedId ? (
        <PayslipDialog id={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}

// ── current period banner ────────────────────────────────────
function CurrentPeriodCard({ data }: { data: PayrollList }) {
  const c = data.current;
  if (!c) {
    return (
      <Card className="shadow-none">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <CalendarDays className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No active pay cycle</p>
            <p className="text-xs text-muted-foreground">Payroll periods are set up by HR.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  const processing = c.status === "PROCESSING" || c.status === "DRAFT";
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarDays className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current pay cycle</p>
              <p className="mt-0.5 text-base font-semibold text-foreground">{monthLabel(c.month, c.year)}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {periodBadge(c.status)}
                <span className="text-xs text-muted-foreground">Pay date: {fmtDate(c.payDate)}</span>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 sm:text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Next pay day</p>
            <p className="mt-0.5 text-sm font-semibold tabular text-foreground">
              {data.nextPayDate ? fmtDate(data.nextPayDate) : "—"}
            </p>
          </div>
        </div>
        {processing ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-[#B54708]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Payroll is being processed. Your payslip will be available after processing completes.</span>
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
            <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Payroll has been released. Payslips for this cycle are available below.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── latest payslip hero ──────────────────────────────────────
function LatestPayslipCard({ latest, onView }: { latest: PayslipSummary; onView: () => void }) {
  return (
    <SectionCard
      title="Latest Payslip"
      icon={<FileText className="h-3.5 w-3.5 text-primary" />}
      action={
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={onView}>
          View Payslip
        </Button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{monthLabel(latest.month, latest.year)}</p>
        <StatusBadge status={latest.status} label={latest.status === "PAID" ? "Paid" : latest.status} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border p-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Gross</p>
          <p className="mt-0.5 text-sm font-semibold tabular text-foreground sm:text-base">{fmtINR(latest.gross)}</p>
        </div>
        <div className="rounded-lg border border-border p-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Deductions</p>
          <p className="mt-0.5 text-sm font-semibold tabular text-danger sm:text-base">{fmtINR(latest.deductions)}</p>
        </div>
        <div className="rounded-lg border border-success/25 bg-success-soft p-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-success/80">Net Pay</p>
          <p className="mt-0.5 text-sm font-semibold tabular text-success sm:text-base">{fmtINR(latest.net)}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="gap-1 px-2 py-0 text-[11px] font-medium text-muted-foreground">
          <CircleCheck className="h-3 w-3 text-success" /> {latest.payableDays} payable days
        </Badge>
        <Badge variant="outline" className="gap-1 px-2 py-0 text-[11px] font-medium text-muted-foreground">
          <TriangleAlert className={cn("h-3 w-3", latest.lopDays > 0 ? "text-[#B54708]" : "text-muted-foreground/60")} /> {latest.lopDays} LOP
        </Badge>
        <Badge variant="outline" className="gap-1 px-2 py-0 text-[11px] font-medium text-muted-foreground">
          <Clock className="h-3 w-3 text-info" /> {latest.overtimeHours}h overtime
        </Badge>
      </div>
    </SectionCard>
  );
}

// ── history table ────────────────────────────────────────────
function HistoryCard({ payslips, onView }: { payslips: PayslipSummary[]; onView: (id: string) => void }) {
  return (
    <SectionCard title="Payslip History" icon={<History className="h-3.5 w-3.5 text-primary" />}>
      {payslips.length === 0 ? (
        <EmptyState title="No payslips yet" message="Processed payroll cycles will appear here." />
      ) : (
        <>
          <div className="hidden max-h-[420px] overflow-y-auto scroll-thin md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                  <TableHead>Generated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => onView(p.id)}
                  >
                    <TableCell className="py-2 text-sm font-medium">{monthLabel(p.month, p.year)}</TableCell>
                    <TableCell className="py-2">
                      <StatusBadge status={p.status} label={p.status === "PAID" ? "Paid" : p.status} />
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm tabular">{fmtINR(p.gross)}</TableCell>
                    <TableCell className="py-2 text-right text-sm tabular text-danger">{fmtINR(p.deductions)}</TableCell>
                    <TableCell className="py-2 text-right text-sm font-semibold tabular">{fmtINR(p.net)}</TableCell>
                    <TableCell className="py-2 text-right text-sm tabular">{p.payableDays}d</TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">{fmtDateShort(p.generatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-2 md:hidden">
            {payslips.map((p) => (
              <button
                key={p.id}
                className="w-full rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
                onClick={() => onView(p.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{monthLabel(p.month, p.year)}</p>
                  <StatusBadge status={p.status} label={p.status === "PAID" ? "Paid" : p.status} />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <p className="text-xs text-muted-foreground">
                    Gross {fmtINR(p.gross)} · {p.payableDays}d payable
                  </p>
                  <p className="text-sm font-semibold tabular text-foreground">{fmtINR(p.net)}</p>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Generated {fmtDateShort(p.generatedAt)}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ── tax & investments card ───────────────────────────────────
function TaxCard({ taxRegime }: { taxRegime: string }) {
  const navigate = useHrmsStore((s) => s.navigate);
  return (
    <SectionCard title="Tax & Investments" icon={<Landmark className="h-3.5 w-3.5 text-primary" />}>
      <InfoRow label="Tax regime" value={taxRegime === "OLD" ? "Old Regime" : "New Regime"} />
      <InfoRow label={`Form 16 (${prevFYLabel(new Date())})`} value="Available" />
      <InfoRow label="Investment proofs" value="Due 15 January" />
      <button
        className="mt-2 flex w-full items-center justify-between rounded-lg bg-accent px-3 py-2.5 text-left transition-colors hover:bg-accent/80"
        onClick={() => navigate("documents")}
      >
        <span className="text-xs font-medium text-accent-foreground">
          Form 16 &amp; salary letters are stored in Documents
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        TDS is estimated on your declared regime. Raise a payroll ticket to update declarations or revise investments.
      </p>
    </SectionCard>
  );
}

// ── payslip dialog ───────────────────────────────────────────
function PayslipDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["payroll", "payslip", id],
    queryFn: () => apiGet<PayslipDetail>(`/api/payroll/${id}`),
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DataState query={query} skeleton={<PayslipSkeleton />} errorTitle="Could not load payslip">
          {(d) => (
            <>
              <DialogHeader className="pb-0">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <DialogTitle className="text-sm">{d.employee.company}</DialogTitle>
                    <p className="text-xs text-muted-foreground">
                      Payslip — {monthLabel(d.payslip.month, d.payslip.year)}
                    </p>
                  </div>
                  <div className="ml-auto">
                    <StatusBadge status={d.payslip.status} label={d.payslip.status === "PAID" ? "Paid" : d.payslip.status} />
                  </div>
                </div>
              </DialogHeader>

              <div className="max-h-[62vh] overflow-y-auto scroll-thin pr-1">
                {/* employee block */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2">
                  <InfoRow label="Employee" value={d.employee.name} />
                  <InfoRow label="Code" value={d.employee.empCode} mono />
                  <InfoRow label="Designation" value={d.employee.designation} />
                  <InfoRow label="Department" value={d.employee.department} />
                  <InfoRow label="Pay period" value={monthLabel(d.period.month, d.period.year)} />
                  <InfoRow label="Pay date" value={fmtDate(d.period.payDate)} />
                </div>

                {/* earnings */}
                <SectionCard title="Earnings" className="mt-3">
                  <Table>
                    <TableBody>
                      {d.payslip.earnings.map((line) => (
                        <TableRow key={line.label} className="hover:bg-transparent">
                          <TableCell className="py-1.5 text-sm text-muted-foreground">{line.label}</TableCell>
                          <TableCell className="py-1.5 text-right text-sm tabular">{fmtINR(line.amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="hover:bg-transparent border-t">
                        <TableCell className="py-2 text-sm font-semibold">Gross Earnings</TableCell>
                        <TableCell className="py-2 text-right text-sm font-semibold tabular">{fmtINR(d.payslip.gross)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </SectionCard>

                {/* deductions */}
                <SectionCard title="Deductions" className="mt-3">
                  <Table>
                    <TableBody>
                      {d.payslip.deductionLines.map((line) => (
                        <TableRow key={line.label} className="hover:bg-transparent">
                          <TableCell className="py-1.5 text-sm text-muted-foreground">{line.label}</TableCell>
                          <TableCell className="py-1.5 text-right text-sm tabular text-danger">{fmtINR(line.amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="hover:bg-transparent border-t">
                        <TableCell className="py-2 text-sm font-semibold">Total Deductions</TableCell>
                        <TableCell className="py-2 text-right text-sm font-semibold tabular text-danger">{fmtINR(d.payslip.deductions)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </SectionCard>

                {/* net pay band */}
                <div className="mt-3 flex items-center justify-between rounded-lg border border-success/25 bg-success-soft px-4 py-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-success/80">Net Pay</p>
                    <p className="text-lg font-semibold tabular text-success">{fmtINR(d.payslip.net)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[11px] text-muted-foreground">
                    <span className="tabular">{d.payslip.payableDays} payable days</span>
                    <span className="tabular">{d.payslip.lopDays} LOP · {d.payslip.overtimeHours}h OT</span>
                  </div>
                </div>

                <Separator className="mt-3" />
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Computer-generated payslip — My Desk HRMS
                </p>
              </div>

              <DialogFooter className="mt-1 gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                <Button size="sm" asChild>
                  <a href={`/api/payroll/${d.payslip.id}?download=1`} download>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download (text)
                  </a>
                </Button>
              </DialogFooter>
            </>
          )}
        </DataState>
      </DialogContent>
    </Dialog>
  );
}

function PayslipSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-2/3 rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}
