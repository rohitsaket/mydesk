"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, ApiError } from "@/lib/hrms/client";
import {
  PageHeader, DataState, Initials, InfoRow, SectionCard, StatusBadge, EmptyState,
} from "@/components/hrms/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  User, Briefcase, Mail, Phone, Lock, GraduationCap, Wrench, Pencil, X, Plus,
  Save, ShieldAlert, LifeBuoy, Building2,
} from "lucide-react";
import { useHrmsStore } from "@/lib/hrms/store";
import { fmtDate } from "@/lib/hrms/time";

interface ProfileData {
  empCode: string;
  role: string;
  personal: {
    firstName: string;
    lastName: string;
    name: string;
    dateOfBirth: string | null;
    gender: string | null;
    address: string | null;
  };
  employment: {
    designation: string;
    department: string | null;
    branch: string | null;
    branchCity: string | null;
    managerName: string | null;
    dateOfJoining: string;
    yearsOfService: number;
    employmentType: string;
    status: string;
  };
  contact: {
    email: string;
    phone: string | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
  };
  bank: {
    bankName: string | null;
    bankAccountMasked: string | null;
    panNumberMasked: string | null;
    taxRegime: string;
  };
  skills: string[];
  education: Record<string, unknown>[];
  experience: Record<string, unknown>[];
}

const PHONE_RE = /^\+?[0-9][0-9\s\-]{7,14}$/;
const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  HR: "HR",
  ADMIN: "Admin",
};

function str(item: Record<string, unknown>, key: string): string | null {
  const v = item[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function yearsLabel(years: number): string {
  if (years <= 0) return "—";
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  if (y === 0) return `${m} month${m === 1 ? "" : "s"}`;
  return `${y} yr${y === 1 ? "" : "s"} ${m} mo${m === 1 ? "" : "s"}`;
}

interface SaveMutationApi {
  mutate: (vars: Record<string, unknown>, opts?: { onSuccess?: () => void }) => void;
  isPending: boolean;
}

// ── personal details card (edit session initialised from fresh server data) ──
function PersonalDetailsCard({ profile, saveMutation }: { profile: ProfileData; saveMutation: SaveMutationApi }) {
  const [form, setForm] = useState<null | {
    phone: string;
    address: string;
    emergencyName: string;
    emergencyPhone: string;
  }>(null);
  const editing = form !== null;

  function startEdit() {
    setForm({
      phone: profile.contact.phone ?? "",
      address: profile.personal.address ?? "",
      emergencyName: profile.contact.emergencyName ?? "",
      emergencyPhone: profile.contact.emergencyPhone ?? "",
    });
  }

  const errors: Partial<Record<"phone" | "emergencyPhone", string>> = {};
  if (editing && form) {
    if (form.phone.trim().length > 0 && !PHONE_RE.test(form.phone.trim())) {
      errors.phone = "Enter a valid phone (e.g. +91 98765 43210)";
    }
    if (form.emergencyPhone.trim().length > 0 && !PHONE_RE.test(form.emergencyPhone.trim())) {
      errors.emergencyPhone = "Enter a valid emergency phone";
    }
  }

  function handleSave() {
    if (!form) return;
    if (Object.keys(errors).length > 0) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    saveMutation.mutate(
      {
        phone: form.phone.trim(),
        address: form.address.trim(),
        emergencyName: form.emergencyName.trim(),
        emergencyPhone: form.emergencyPhone.trim(),
      },
      { onSuccess: () => setForm(null) }
    );
  }

  return (
    <SectionCard
      title="Personal Details"
      icon={<User className="h-4 w-4" />}
      action={
        editing ? null : (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={startEdit}>
            <Pencil className="h-3 w-3" /> Edit
          </Button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-xs">Phone</Label>
          <Input
            id="phone"
            value={editing && form ? form.phone : (profile.contact.phone ?? "")}
            readOnly={!editing}
            disabled={saveMutation.isPending}
            onChange={(e) => setForm((f) => (f ? { ...f, phone: e.target.value } : f))}
            placeholder="+91 98765 43210"
            className="h-8 text-sm"
          />
          {errors.phone ? <p className="text-[11px] text-danger">{errors.phone}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emergencyName" className="text-xs">Emergency contact name</Label>
          <Input
            id="emergencyName"
            value={editing && form ? form.emergencyName : (profile.contact.emergencyName ?? "")}
            readOnly={!editing}
            disabled={saveMutation.isPending}
            onChange={(e) => setForm((f) => (f ? { ...f, emergencyName: e.target.value } : f))}
            placeholder="Spouse / Parent"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emergencyPhone" className="text-xs">Emergency contact phone</Label>
          <Input
            id="emergencyPhone"
            value={editing && form ? form.emergencyPhone : (profile.contact.emergencyPhone ?? "")}
            readOnly={!editing}
            disabled={saveMutation.isPending}
            onChange={(e) => setForm((f) => (f ? { ...f, emergencyPhone: e.target.value } : f))}
            placeholder="+91 98765 43210"
            className="h-8 text-sm"
          />
          {errors.emergencyPhone ? <p className="text-[11px] text-danger">{errors.emergencyPhone}</p> : null}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address" className="text-xs">Address</Label>
          <Input
            id="address"
            value={editing && form ? form.address : (profile.personal.address ?? "")}
            readOnly={!editing}
            disabled={saveMutation.isPending}
            onChange={(e) => setForm((f) => (f ? { ...f, address: e.target.value } : f))}
            placeholder="Residential address"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {editing && form ? (
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="h-3 w-3" /> {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setForm(null)} disabled={saveMutation.isPending}>
            Cancel
          </Button>
        </div>
      ) : null}

      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        <InfoRow label="Employee code" value={<span className="font-mono text-xs">{profile.empCode}</span>} />
        <InfoRow label="Date of birth" value={profile.personal.dateOfBirth ? fmtDate(profile.personal.dateOfBirth) : "—"} />
        <InfoRow label="Gender" value={profile.personal.gender ?? "—"} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Date of birth and gender are maintained by HR. Update contact details via the form above.
      </p>
    </SectionCard>
  );
}

// ── skills card with an edit session ─────────────────────────
function SkillsCard({ profile, saveMutation }: { profile: ProfileData; saveMutation: SaveMutationApi }) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const editing = draft !== null;
  const skills = editing && draft ? draft : profile.skills;

  function addSkill() {
    const s = skillInput.trim();
    if (!s || !draft) return;
    if (draft.some((x) => x.toLowerCase() === s.toLowerCase())) {
      toast.error("Skill already added");
      return;
    }
    if (draft.length >= 30) {
      toast.error("Maximum 30 skills");
      return;
    }
    setDraft([...draft, s]);
    setSkillInput("");
  }

  function handleSave() {
    if (!draft) return;
    const cleaned = draft.map((s) => s.trim()).filter((s) => s.length > 0);
    if (cleaned.length === 0) {
      toast.error("Keep at least one skill");
      return;
    }
    saveMutation.mutate(
      { skills: cleaned },
      { onSuccess: () => setDraft(null) }
    );
  }

  return (
    <SectionCard
      title="Skills"
      icon={<Wrench className="h-4 w-4" />}
      action={
        editing ? (
          <div className="flex items-center gap-1.5">
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="h-3 w-3" /> {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setDraft(null); setSkillInput(""); }} disabled={saveMutation.isPending}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setDraft([...profile.skills])}>
            <Pencil className="h-3 w-3" /> Edit
          </Button>
        )
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {skills.length === 0 ? (
          <p className="text-xs text-muted-foreground">No skills added yet — add your first one below.</p>
        ) : (
          skills.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1 text-[11px] font-normal">
              {s}
              {editing ? (
                <button
                  type="button"
                  aria-label={`Remove ${s}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-danger"
                  onClick={() => setDraft((d) => (d ? d.filter((x) => x !== s) : d))}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </Badge>
          ))
        )}
      </div>
      {editing ? (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill();
              }
            }}
            placeholder="Add a skill (e.g. Kubernetes)"
            className="h-8 w-full max-w-xs text-sm"
            maxLength={40}
          />
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={addSkill}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      ) : null}
    </SectionCard>
  );
}

export default function ProfileView() {
  const setView = useHrmsStore((s) => s.setView);
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiGet<ProfileData>("/api/profile"),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPatch<{ profile: ProfileData }>("/api/profile", payload),
    onSuccess: () => {
      toast.success("Profile updated");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save changes");
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Profile"
        subtitle="Personal information, employment record and preferences"
        icon={<User className="h-4.5 w-4.5" />}
      />

      <DataState query={profileQuery}>
        {(profile) => (
          <Tabs defaultValue="personal" className="space-y-4">
            <TabsList className="h-9 w-full justify-start overflow-x-auto">
              <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
              <TabsTrigger value="employment" className="text-xs">Employment</TabsTrigger>
              <TabsTrigger value="contact" className="text-xs">Contact</TabsTrigger>
              <TabsTrigger value="bank" className="text-xs">Bank &amp; Tax</TabsTrigger>
              <TabsTrigger value="skills" className="text-xs">Skills &amp; Education</TabsTrigger>
            </TabsList>

            {/* ── PERSONAL ── */}
            <TabsContent value="personal" className="mt-0 space-y-4">
              <SectionCard title="Identity">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Initials first={profile.personal.firstName} last={profile.personal.lastName} size="lg" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-foreground">{profile.personal.name}</p>
                      <Badge variant="outline" className="bg-accent text-[11px] text-accent-foreground">
                        {ROLE_LABELS[profile.role] ?? profile.role}
                      </Badge>
                      <StatusBadge status={profile.employment.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{profile.employment.designation}</p>
                  </div>
                </div>
              </SectionCard>

              <PersonalDetailsCard profile={profile} saveMutation={saveMutation} />
            </TabsContent>

            {/* ── EMPLOYMENT ── */}
            <TabsContent value="employment" className="mt-0 space-y-4">
              <SectionCard title="Employment Record" icon={<Briefcase className="h-4 w-4" />}>
                <div className="divide-y divide-border rounded-lg border border-border">
                  <InfoRow label="Designation" value={profile.employment.designation} />
                  <InfoRow label="Department" value={profile.employment.department ?? "—"} />
                  <InfoRow label="Branch" value={profile.employment.branch ?? "—"} />
                  <InfoRow label="Reporting manager" value={profile.employment.managerName ?? "—"} />
                  <InfoRow label="Date of joining" value={fmtDate(profile.employment.dateOfJoining)} />
                  <InfoRow label="Years of service" value={yearsLabel(profile.employment.yearsOfService)} />
                  <InfoRow label="Employment type" value={profile.employment.employmentType.replace(/_/g, " ")} />
                  <InfoRow label="Status" value={<StatusBadge status={profile.employment.status} />} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" /> Managed by HR — self-service edits are not available.
                  </p>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setView("helpdesk")}>
                    <LifeBuoy className="h-3.5 w-3.5" /> Request change
                  </Button>
                </div>
              </SectionCard>
            </TabsContent>

            {/* ── CONTACT ── */}
            <TabsContent value="contact" className="mt-0 space-y-4">
              <SectionCard title="Contact Information" icon={<Mail className="h-4 w-4" />}>
                <div className="divide-y divide-border rounded-lg border border-border">
                  <InfoRow
                    label="Work email"
                    value={
                      <a href={`mailto:${profile.contact.email}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Mail className="h-3 w-3" /> {profile.contact.email}
                      </a>
                    }
                  />
                  <InfoRow
                    label="Phone"
                    value={
                      profile.contact.phone ? (
                        <a href={`tel:${profile.contact.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <Phone className="h-3 w-3" /> {profile.contact.phone}
                        </a>
                      ) : "—"
                    }
                  />
                  <InfoRow label="Emergency contact" value={profile.contact.emergencyName ?? "—"} />
                  <InfoRow
                    label="Emergency phone"
                    value={
                      profile.contact.emergencyPhone ? (
                        <a href={`tel:${profile.contact.emergencyPhone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <Phone className="h-3 w-3" /> {profile.contact.emergencyPhone}
                        </a>
                      ) : "—"
                    }
                  />
                </div>
                <div className="mt-3">
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" asChild>
                    <a href={`mailto:${profile.contact.email}`}>
                      <Mail className="h-3.5 w-3.5" /> Email me
                    </a>
                  </Button>
                </div>
              </SectionCard>
            </TabsContent>

            {/* ── BANK & TAX ── */}
            <TabsContent value="bank" className="mt-0 space-y-4">
              <SectionCard title="Bank & Tax Details" icon={<Lock className="h-4 w-4" />}>
                <div className="divide-y divide-border rounded-lg border border-border">
                  <InfoRow
                    label="Bank name"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-muted-foreground" /> {profile.bank.bankName ?? "—"}
                      </span>
                    }
                  />
                  <InfoRow
                    label="Account number"
                    value={
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                        <Lock className="h-3 w-3 text-muted-foreground" /> {profile.bank.bankAccountMasked ?? "—"}
                      </span>
                    }
                  />
                  <InfoRow
                    label="PAN number"
                    value={
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                        <Lock className="h-3 w-3 text-muted-foreground" /> {profile.bank.panNumberMasked ?? "—"}
                      </span>
                    }
                  />
                  <InfoRow label="Tax regime" value={`${profile.bank.taxRegime} regime`} />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Sensitive — contact payroll for changes. Values are masked for your privacy.
                </p>
              </SectionCard>
            </TabsContent>

            {/* ── SKILLS & EDUCATION ── */}
            <TabsContent value="skills" className="mt-0 space-y-4">
              <SkillsCard profile={profile} saveMutation={saveMutation} />

              <SectionCard title="Education" icon={<GraduationCap className="h-4 w-4" />}>
                {profile.education.length === 0 ? (
                  <EmptyState title="No education records" message="Your education details have not been captured yet." />
                ) : (
                  <div className="space-y-2.5">
                    {profile.education.map((ed, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
                        <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{str(ed, "degree") ?? "Qualification"}</p>
                          <p className="text-xs text-muted-foreground">
                            {str(ed, "institute") ?? "Institute"}
                            {typeof ed.year === "number" ? ` · ${ed.year}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Experience" icon={<Building2 className="h-4 w-4" />}>
                {profile.experience.length === 0 ? (
                  <EmptyState
                    title="No prior experience recorded"
                    message="External experience is captured by HR at onboarding."
                  />
                ) : (
                  <div className="relative space-y-4 border-l border-border pl-4">
                    {profile.experience.map((ex, i) => {
                      const title = str(ex, "title") ?? str(ex, "role") ?? str(ex, "designation") ?? "Role";
                      const company = str(ex, "company") ?? str(ex, "employer") ?? "Company";
                      const periodParts = [str(ex, "from"), str(ex, "to") ?? "Present"].filter(Boolean);
                      return (
                        <div key={i} className="relative">
                          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                          <p className="text-sm font-medium text-foreground">{title}</p>
                          <p className="text-xs text-muted-foreground">{company}</p>
                          {periodParts.length > 0 ? (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{periodParts.join(" — ")}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </TabsContent>
          </Tabs>
        )}
      </DataState>
    </div>
  );
}
