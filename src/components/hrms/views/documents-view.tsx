"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageHeader, SectionCard, DataState, DataSkeleton, EmptyState, InfoRow,
} from "@/components/hrms/shared";
import { apiGet } from "@/lib/hrms/client";
import { fmtDate, fmtDateShort } from "@/lib/hrms/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  FolderOpen, Search, Lock, Download, FileText, FileImage, FileSpreadsheet,
  FileType, File, Globe, ShieldCheck, ScrollText,
} from "lucide-react";

// ── types (API contract) ─────────────────────────────────────
interface DocItem {
  id: string;
  name: string;
  category: string;
  fileExt: string;
  sizeKb: number;
  confidentiality: string;
  shared: boolean;
  uploadedAt: string;
}

interface DocumentsPayload {
  items: DocItem[];
}

// ── constants ────────────────────────────────────────────────
const CATEGORY_TABS = [
  { value: "ALL", label: "All" },
  { value: "APPOINTMENT", label: "Appointment" },
  { value: "OFFER", label: "Offer" },
  { value: "ID", label: "ID" },
  { value: "SALARY_REVISION", label: "Salary Revision" },
  { value: "PAYSLIP", label: "Payslip" },
  { value: "TAX", label: "Tax" },
  { value: "POLICY", label: "Policy" },
  { value: "CERTIFICATE", label: "Certificate" },
  { value: "LETTER", label: "Letter" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  APPOINTMENT: "Appointment",
  OFFER: "Offer",
  ID: "ID",
  SALARY_REVISION: "Salary Revision",
  PAYSLIP: "Payslip",
  TAX: "Tax",
  POLICY: "Policy",
  CERTIFICATE: "Certificate",
  LETTER: "Letter",
};

const EXT_META: Record<string, { icon: LucideIcon; className: string }> = {
  pdf: { icon: FileText, className: "bg-danger-soft text-danger" },
  doc: { icon: FileType, className: "bg-info-soft text-info" },
  docx: { icon: FileType, className: "bg-info-soft text-info" },
  xls: { icon: FileSpreadsheet, className: "bg-success-soft text-success" },
  xlsx: { icon: FileSpreadsheet, className: "bg-success-soft text-success" },
  csv: { icon: FileSpreadsheet, className: "bg-success-soft text-success" },
  png: { icon: FileImage, className: "bg-accent text-accent-foreground" },
  jpg: { icon: FileImage, className: "bg-accent text-accent-foreground" },
  jpeg: { icon: FileImage, className: "bg-accent text-accent-foreground" },
};

function extMeta(fileExt: string): { icon: LucideIcon; className: string } {
  return EXT_META[fileExt.toLowerCase()] ?? { icon: File, className: "bg-muted text-muted-foreground" };
}

function fmtSize(sizeKb: number): string {
  return sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
}

// ── main view ────────────────────────────────────────────────
export default function DocumentsView() {
  const [category, setCategory] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DocItem | null>(null);

  const query = useQuery({ queryKey: ["documents"], queryFn: () => apiGet<DocumentsPayload>("/api/documents") });

  const own = useMemo(() => (query.data?.items ?? []).filter((d) => !d.shared), [query.data]);
  const shared = useMemo(() => (query.data?.items ?? []).filter((d) => d.shared), [query.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return own.filter((d) =>
      (category === "ALL" || d.category === category) &&
      (q === "" || d.name.toLowerCase().includes(q))
    );
  }, [own, category, search]);

  return (
    <div className="space-y-4">
      <PageHeader title="Documents" subtitle="Your letters, policies and records" icon={<FolderOpen className="h-4.5 w-4.5" />} />

      <DataState query={query} skeleton={<DataSkeleton />}>
        {() => (
          <>
            {/* filters */}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search documents…"
                  className="h-9 pl-8 text-sm"
                />
              </div>
              <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
                {filtered.length} of {own.length} document{own.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="flex w-full flex-wrap gap-1.5">
              {CATEGORY_TABS.map((t) => (
                <button
                  key={t.value}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    category === t.value
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-accent"
                  )}
                  onClick={() => setCategory(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* grid */}
            {filtered.length === 0 ? (
              <EmptyState
                title="No documents found"
                message={search ? "Try a different search term or category." : "Your HR documents will appear here once issued."}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((d) => (
                  <DocCard key={d.id} doc={d} onClick={() => setSelected(d)} />
                ))}
              </div>
            )}

            {/* company policies */}
            {shared.length > 0 ? (
              <SectionCard title="Company Policies" icon={<ScrollText className="h-3.5 w-3.5 text-primary" />}>
                <div className="space-y-1.5">
                  {shared.map((d) => (
                    <button
                      key={d.id}
                      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                      onClick={() => setSelected(d)}
                    >
                      <Globe className="h-4 w-4 shrink-0 text-info" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Shared company-wide · updated {fmtDateShort(d.uploadedAt)}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-info/20 bg-info-soft px-1.5 py-0 text-[11px] font-medium text-info">
                        Policy
                      </Badge>
                    </button>
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </>
        )}
      </DataState>

      {selected ? (
        <DocumentDialog doc={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

// ── document card ────────────────────────────────────────────
function DocCard({ doc, onClick }: { doc: DocItem; onClick: () => void }) {
  const meta = extMeta(doc.fileExt);
  const Icon = meta.icon;
  const sensitive = doc.confidentiality === "SENSITIVE";

  return (
    <Card className="shadow-none transition-colors hover:border-primary/40">
      <CardContent className="p-3.5">
        <button className="w-full text-left" onClick={onClick}>
          <div className="flex items-start gap-3">
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meta.className)}>
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{doc.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="bg-muted px-1.5 py-0 text-[11px] font-medium text-muted-foreground">
                  {CATEGORY_LABELS[doc.category] ?? doc.category}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {doc.fileExt.toUpperCase()} · {fmtSize(doc.sizeKb)}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {sensitive ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-danger/20 bg-danger-soft px-1.5 py-0 text-[11px] font-medium text-danger">
                <Lock className="h-3 w-3" /> Sensitive
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0 text-[11px] font-medium text-muted-foreground">
                <ShieldCheck className="h-3 w-3" /> Normal
              </span>
            )}
            {doc.shared ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-info/20 bg-info-soft px-1.5 py-0 text-[11px] font-medium text-info">
                <Globe className="h-3 w-3" /> Company-wide
              </span>
            ) : null}
            <span className="ml-auto text-[11px] text-muted-foreground">{fmtDateShort(doc.uploadedAt)}</span>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

// ── details dialog ───────────────────────────────────────────
function DocumentDialog({ doc, onClose }: { doc: DocItem; onClose: () => void }) {
  const meta = extMeta(doc.fileExt);
  const Icon = meta.icon;
  const sensitive = doc.confidentiality === "SENSITIVE";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", meta.className)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="pr-6 leading-snug">{doc.name}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {CATEGORY_LABELS[doc.category] ?? doc.category} · {doc.fileExt.toUpperCase()} · {fmtSize(doc.sizeKb)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-0.5">
          <InfoRow label="Uploaded" value={fmtDate(doc.uploadedAt)} />
          <InfoRow label="Confidentiality" value={sensitive ? "Sensitive" : "Normal"} />
          <InfoRow label="Shared" value={doc.shared ? "Company-wide" : "Private to you"} />
        </div>

        {sensitive ? (
          <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>This document is confidential. Access is logged for security review.</span>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button asChild>
            <a href={`/api/documents/${doc.id}/download`} download>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
