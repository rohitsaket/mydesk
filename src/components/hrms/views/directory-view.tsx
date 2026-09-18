"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/hrms/client";
import {
  PageHeader, DataState, EmptyState, Initials, InfoRow,
} from "@/components/hrms/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Users, Search, Mail, Copy, MapPin, Phone, ShieldCheck, BadgeCheck,
} from "lucide-react";

interface DirectoryEmployee {
  id: string;
  empCode: string;
  firstName: string;
  lastName: string;
  name: string;
  designation: string;
  department: string | null;
  branchCity: string | null;
  email: string;
  phone: string | null;
  skills: string[];
  managerName: string | null;
}

interface DirectoryData {
  total: number;
  employees: DirectoryEmployee[];
  departments: { id: string; name: string }[];
}

async function copyEmail(email: string) {
  try {
    await navigator.clipboard.writeText(email);
    toast.success("Email copied");
  } catch {
    toast.error("Could not copy email — select it manually");
  }
}

export default function DirectoryView() {
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [dept, setDept] = useState("ALL");
  const [selected, setSelected] = useState<DirectoryEmployee | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const directoryQuery = useQuery({
    queryKey: ["directory", debouncedQ, dept],
    queryFn: () =>
      apiGet<DirectoryData>(
        `/api/directory?q=${encodeURIComponent(debouncedQ)}&dept=${encodeURIComponent(dept)}`
      ),
  });

  const deptOptions = useMemo(() => {
    const d = directoryQuery.data?.departments ?? [];
    return d;
  }, [directoryQuery.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Company Directory"
        subtitle="Find colleagues across the organisation"
        icon={<Users className="h-4.5 w-4.5" />}
      />

      {/* search + filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, code or designation…"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="h-9 w-full text-sm sm:w-[190px]">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All departments</SelectItem>
            {deptOptions.map((d) => (
              <SelectItem key={d.id} value={d.name}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataState query={directoryQuery}>
        {(data) => (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {data.total === 0
                ? "No colleagues match your search."
                : `${data.total} colleague${data.total === 1 ? "" : "s"} found`}
            </p>

            {data.employees.length === 0 ? (
              <EmptyState
                title="No matches"
                message="Try a different name, email or department filter."
                icon={<Users className="h-5 w-5" />}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.employees.map((e) => (
                  <div
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setSelected(e);
                      }
                    }}
                    className="flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-3.5 text-left shadow-none transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start gap-3">
                      <Initials first={e.firstName} last={e.lastName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{e.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{e.designation}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {e.department ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                          {e.department}
                        </Badge>
                      ) : null}
                      {e.branchCity ? (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {e.branchCity}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2.5">
                      <span className="font-mono text-[10px] text-muted-foreground">{e.empCode}</span>
                      <span className="flex items-center gap-1">
                        <a
                          href={`mailto:${e.email}`}
                          title={`Email ${e.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          title="Copy email"
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void copyEmail(e.email);
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Profile visibility follows company privacy policy.
            </p>
          </div>
        )}
      </DataState>

      {/* detail dialog */}
      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto scroll-thin sm:max-w-md">
          {selected ? (
            <>
              <DialogHeader className="pb-0 text-left">
                <DialogTitle className="flex items-center gap-3 text-left">
                  <Initials first={selected.firstName} last={selected.lastName} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{selected.name}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">{selected.designation}</p>
                  </div>
                </DialogTitle>
                <DialogDescription className="sr-only">Colleague profile details</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selected.department ? (
                    <Badge variant="outline" className="text-[11px]">{selected.department}</Badge>
                  ) : null}
                  <Badge variant="outline" className="gap-1 text-[11px]">
                    <MapPin className="h-3 w-3" /> {selected.branchCity ?? "—"}
                  </Badge>
                </div>

                <div className="divide-y divide-border rounded-lg border border-border">
                  <InfoRow label="Employee code" value={<span className="font-mono text-xs">{selected.empCode}</span>} />
                  <InfoRow
                    label="Email"
                    value={
                      <a href={`mailto:${selected.email}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Mail className="h-3 w-3" /> {selected.email}
                      </a>
                    }
                  />
                  <InfoRow
                    label="Phone"
                    value={
                      selected.phone ? (
                        <a href={`tel:${selected.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <Phone className="h-3 w-3" /> {selected.phone}
                        </a>
                      ) : "—"
                    }
                  />
                  <InfoRow label="Manager" value={selected.managerName ?? "—"} />
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Skills</p>
                  {selected.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.skills.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[11px] font-normal">{s}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No skills listed.</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" asChild>
                    <a href={`mailto:${selected.email}`}>
                      <Mail className="h-3.5 w-3.5" /> Send email
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => void copyEmail(selected.email)}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy email
                  </Button>
                </div>

                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Profile visibility follows company privacy policy.
                </p>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
