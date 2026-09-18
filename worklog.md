# My Desk — NISS HRMS Project Worklog

Enterprise employee-desk HRMS built on Next.js 16 (App Router) + TypeScript + Prisma (SQLite) + shadcn/ui + Tailwind 4 + TanStack Query + Zustand.

## Architecture Decisions

- **Single user-visible route `/`**: the entire app is a client-side SPA. "Pages" are views switched via Zustand (`useHrmsStore.view`). NEVER create additional page routes under `src/app/`.
- **APIs**: Next.js API routes under `src/app/api/*`. Always use `getAuth()` from `@/lib/hrms/auth` for session context; never trust client-supplied employee IDs (IDOR protection).
- **Response envelope**: `{ success: true, data }` / `{ success: false, error: { code, message } }` via helpers `ok()`, `badRequest()`, `unauthorized()`, `serverError()` from `@/lib/hrms/auth`.
- **DB**: Prisma SQLite. Import client as `import { db } from "@/lib/db"`. No enums (SQLite) — string constants everywhere.
- **Design tokens** in `src/app/globals.css` (light+dark). Primary #2563EB. Success/warning/danger/info soft tokens: `bg-success-soft`, `text-[#B54708]` for warning text on light backgrounds.
- **Fonts**: Inter (--font-sans), Geist Mono (--font-geist-mono for timers with `.tabular` class).

## Established Conventions (MUST follow)

1. **Shared UI kit**: `@/components/hrms/shared` exports `PageHeader`, `SectionCard`, `StatusBadge`, `PriorityBadge`, `TaskStatusBadge`, `StatCard`, `EmptyState`, `DataState` (loading/error/retry wrapper around react-query), `DataSkeleton`, `Initials`, `InfoRow`. USE THESE — do not re-implement.
2. **API client**: `apiGet/apiPost/apiPatch/apiDelete` from `@/lib/hrms/client` (throws `ApiError` with code+message).
3. **React Query**: query keys are arrays like `["tasks"]`, `["leave", "requests"]`. 30s staleTime default.
4. **Time formatting**: `@/lib/hrms/time` → `fmtTime(t, timeFormat)`, `fmtDate`, `fmtDateShort`, `fmtDuration(minutes)`, `fmtClock(seconds)`, `fmtINR`, `relativeTime`, plus label maps `ATTENDANCE_STATUS_LABELS`, `BREAK_TYPE_LABELS`, `TASK_STATUS_LABELS`, `PRIORITY_LABELS`. All times are IST (Asia/Calcutta).
5. **Time format preference**: `useHrmsStore((s) => s.timeFormat)` gives "12h"|"24h" — pass to fmtTime.
6. **Navigation**: `const navigate = useHrmsStore((s) => s.navigate); navigate("leave", "apply")` — second arg is a form trigger. Views read `useHrmsStore((s) => s.openForm)` in useEffect on mount and auto-open their create dialog when set, then call `setOpenForm(null)`.
7. **Toasts**: `import { toast } from "sonner"`. Success/error feedback for every mutation.
8. **Zod** for API input validation (already used in login).
9. **Audit logging**: call `audit(actor, "ACTION_NAME", "Entity", entityId, details)` from `@/lib/hrms/auth` for state changes.
10. **Server time sync**: attendance hero uses `syncServerTime(serverTime)`; store exposes `now()`.
11. **Styling**: compact enterprise density. Cards `shadow-none` + 1px border. Rounded 10-12px. No oversized text. Use `max-h-* overflow-y-auto scroll-thin` for long lists. Data tables: shadcn `Table`. Mobile: convert tables to stacked cards (hidden md:table / md:hidden cards pattern).
12. **TypeScript strict**: no `any` (use `unknown` + narrowing). All Prisma JSON fields parse explicitly.

## Database Schema (prisma/schema.prisma)

Models: User, Session, Company, Branch, Department, Employee (self-relation manager "TeamOf"), Shift, ShiftAssignment, AttendanceDay (state machine: NOT_STARTED/WORKING/ON_BREAK/CHECKED_OUT; status: PENDING/P/A/L/H/WO/WFH/OD/HD/MP), AttendanceEvent (immutable log: CHECK_IN/BREAK_START/BREAK_END/CHECK_OUT), LeaveType, LeaveBalance, LeaveRequest (PENDING/APPROVED/REJECTED/CANCELLED, currentStage MANAGER/HR/DONE), DutyRequest (type WFH/ON_DUTY), Regularization, Task, CalendarEvent, Holiday, TimesheetEntry, PayrollPeriod, Payslip, Expense, Document, HrTicket, Notification, Announcement, AnnouncementAck, Goal, Asset, AuditLog.

## Demo Accounts (password: demo123)

- Employee: rohit.patel@niss.tech (NISS001) — hero user, working today, missing punch yesterday
- Manager: anita.desai@niss.tech (NISS002) — Tech manager with direct reports
- HR: payal.mehta@niss.tech (NISS003)
- Admin: vikram.shah@niss.tech (NISS004)
- Also seeded: 22 more employees, all password demo123.

---
Task ID: 1-7 (foundation)
Agent: main (Z.ai Code)
Task: Foundation — DB schema+seed, design tokens, providers, auth/session, attendance engine, desk aggregate API, login screen, app shell, desk homepage.

Work Log:
- prisma/schema.prisma: full HRMS schema (28 models), pushed to SQLite, generated client.
- prisma/seed.ts: realistic demo data (26 employees, 3 branches, 5 departments, 3 shifts, 45 days attendance history, today's live states, leaves/WFH/OD/regularizations, tasks, calendar events, holidays, timesheets, 3 payroll periods + payslips, expenses, documents, HR tickets, notifications, announcements w/ ack, goals, assets, audit logs).
- globals.css: enterprise tokens (light/dark), Inter font, tabular numerals, scroll-thin, live-dot animation.
- layout.tsx: Inter + Geist_Mono, Providers (QueryClient + next-themes), sonner Toaster.
- src/lib/hrms/: auth.ts (scrypt hashing, sessions, RBAC permissions, audit, API helpers), types.ts (all shared payload types), time.ts (IST helpers + formatters + label maps), client.ts (typed fetch), store.ts (Zustand: view, employee, openForm, serverTime sync, sidebar, command palette), attendance.ts (state machine engine: checkIn/startBreak/endBreak/checkOut + buildAttendanceToday + deriveBaseStatus), context.ts (buildEmployeeContext).
- APIs: /api/auth/{login,logout,me}, /api/attendance/{today,check-in,check-out,break-start,break-end}, /api/desk (17-section aggregate), /api/notifications (GET+POST read/read-all), /api/announcements (GET+POST ack), /api/search.
- UI: login-view (split brand panel, demo accounts), topbar (search, quick-create, notifications popover, profile menu, theme cycle), sidebar (collapsible, manager section), bottom-nav (mobile 4+more sheet), command-palette (⌘K: employees/requests search + quick actions + navigate), app-shell (lazy view router + footer), hrms-app (auth gate).
- Desk homepage: AttendanceHero (live timer w/ server-drift correction, DayRing, progress bar, break dialog with 5 break types, checkout confirmation with early-exit reason flow, warning states), SummaryCards (5 metrics), TodayTimeline, UpcomingPanel (events+next holiday+celebrations+assets), WeeklyHours (custom bar visualization + totals), MyTasksWidget, MonthSummaryWidget, LeaveBalanceWidget (with apply CTA + upcoming leave), AnnouncementsWidget (with acknowledge), ManagerWidgetsPanel (team today + pending approvals), WarningBanners.
- Stub views created for all 19 module views (to be replaced by subagents).

Stage Summary:
- App runs on port 3000; login → desk golden path verified via curl (auth 200, me 200, attendance/today correct state WORKING 353m worked, desk aggregate all sections present).
- Attendance state machine server-authoritative; client timer ticks locally with serverTime offset.
- Lint passes (0 errors, 0 warnings after fix).
- NEXT: module views + module APIs via 4 parallel subagents (see tasks 8-a..8-d), then integration QA.

Unresolved / Notes for next agents:
- Module stubs at src/components/hrms/views/*-view.tsx MUST be replaced with full implementations.
- Each module API folder exists (empty): attendance/month, leave, duty-requests, tasks, timesheet, calendar, payroll, expenses, documents, hr-tickets, directory, performance, profile, settings, team, approvals, holidays, shifts.
- Use `export const dynamic = "force-dynamic";` in every API route.
- Keep every interactive control functional (no placeholder buttons).

---
Task ID: 8-c
Agent: module-finance-docs
Task: Payroll, Expenses, Documents, HR Service Desk — module APIs + views (replaced 4 stubs, created 7 API routes).

Work Log:
- API /api/payroll (GET): own payroll overview — current period {periodId, month, year, status, payDate} (latest company period), payslips newest-first (sorted by period year/month), nextPayDate (earliest upcoming payDate else most recent), employee taxRegime.
- API /api/payroll/[id] (GET): full payslip detail — own payslips only (else 404); earnings/deductions parsed from JSON with unknown-narrowing; period info; employee context (name, empCode, designation, department, company). ?download=1 returns a REAL text/plain attachment (company header, employee block, earnings/deductions tables, NET PAY, payable/LOP/OT, "Computer-generated payslip — My Desk HRMS" footnote) + PAYSLIP_DOWNLOAD audit.
- API /api/expenses: GET ?status (raw statuses + REIMBURSED→FINANCE_APPROVED/PAID, APPROVED→MANAGER+FINANCE) own expenses newest-first + totals {claimed, pending, approved, reimbursed}. POST (zod): create draft (EX-5xx from max suffix+1), action:"submit" (DRAFT→SUBMITTED+audit), action:"withdraw" (SUBMITTED→CANCELLED+audit), action:"update" (own DRAFT edit — added so the Edit dialog is functional).
- API /api/documents (GET): own documents + company-shared (employeeId null + sharedWithTeam), mapped with `shared` flag.
- API /api/documents/[id]/download (GET): REAL downloadable file — text summary of document metadata (name, category, issued to, uploaded, confidentiality, source file) as text/plain attachment with slug filename; own-or-shared verification (404 otherwise); DOCUMENT_DOWNLOAD audit (flags sensitive).
- API /api/hr-tickets: GET own tickets newest-first with parsed commentsJson; POST create (zod: category HR/IT/FACILITIES/PAYROLL/ADMIN, subject≥5, description≥10, priority) → code HR-10xx (max suffix+1), status OPEN, assignee map (IT Support / Facilities / Payroll / HR Operations) + audit.
- API /api/hr-tickets/[id] (POST): {text} appends {by:"You", at, text} to commentsJson + updatedAt (own ticket only); {action:"close"} RESOLVED→CLOSED + audit.
- View payroll-view.tsx: PageHeader; current-period banner (PROCESSING amber override / PAID green, pay date, next pay day, processing note); latest-payslip hero (Gross/Deductions/Net with success tone, payable/LOP/OT chips); payslip history Table (scroll-thin) → cards on mobile, row click opens dialog; payslip Dialog (company header, employee InfoRows, Earnings + Deductions tables from JSON, emphasized NET PAY band, footnote, Download (text) anchor → ?download=1); Tax & Investments card (regime from API, Form 16 prev-FY label computed, link navigates to documents view).
- View expenses-view.tsx: this-month StatCards (claimed/pending/reimbursed, fmtINR, dayIST month filter); filter Tabs with counts (All/Draft/Submitted/Approved/Rejected/Reimbursed — FINANCE_APPROVED+PAID→Reimbursed per spec); expense cards (mono code, category icon badge Plane/Utensils/BedDouble/Fuel/Briefcase/Package/Circle, merchant/description, project chip, receipt chip, StatusBadge, decision note + decided date, PAID date chip); mini status timeline Draft→Submitted→Manager→Finance→Paid with done/in-flight dots + Rejected/Withdrawn terminal chips; DRAFT actions Submit (AlertDialog) + Edit; SUBMITTED action Withdraw (AlertDialog, danger); create/edit dialog (category Select, date, amount>0, merchant, project, description, receipt filename capture — field-adjacent validation errors), auto-opens via store.openForm (deferred setTimeout pattern), form seeded via key-remount + reset-on-close (lint-clean, no setState-in-effect).
- View documents-view.tsx: search input + 10 category filter chips; responsive grid of doc cards (ext-colored icons PDF/DOC/XLS/IMG, category badge, KB/MB size, SENSITIVE red-soft / NORMAL confidentiality, shared badge, uploaded date); details Dialog (InfoRows metadata, "Access logged" note for sensitive, real Download button hitting the API); Company Policies section for sharedWithTeam docs.
- View helpdesk-view.tsx: FAQ Accordion (regularization / payslips / expenses answers); Open Tickets + Ticket History sections; ticket cards (mono code, category color badge incl. seeded ATTENDANCE, PriorityBadge with NORMAL handling, StatusBadge, assignee, relative created/updated, comment count); ticket Dialog (description, chat-style comment thread scrollable max-h-72 with You right-aligned, comment composer POSTs {text}, Close Ticket AlertDialog when RESOLVED, SLA note); create dialog (category Select, subject≥5, description≥10, priority RadioGroup) with auto-open via openForm + toasts.
- Verification: curl end-to-end for all 7 routes (login rohit.patel@niss.tech) — create/submit/withdraw/update expense, comment, close ticket, both downloads return text/plain attachments with Content-Disposition; 404 on foreign payslip/document, 401 unauth. Browser smoke test via agent-browser (isolated session): payroll view + payslip dialog + download link, expenses tabs/timeline/create EX-521/submit flow, documents search/filter/detail dialog, helpdesk FAQ/ticket dialog/comment post/create HR-1052. All test mutations surgically reverted (EX-520/EX-521 deleted, EX-518→DRAFT, HR-1051/HR-1052 deleted, HR-1036→RESOLVED w/ seeded comments, test audit rows removed) — demo DB back to seeded state for QA.
- `bunx eslint` on my 10 files: 0 errors 0 warnings (project `bun run lint` still fails on OTHER agents' files: profile-view.tsx set-state-in-effect ×3 — not mine). `bunx tsc --noEmit`: 0 errors in my files. dev.log clean.

Stage Summary:
- Payroll / Expenses / Documents / Helpdesk modules fully functional (APIs + enterprise views, shared kit, responsive table→card, scroll-thin lists, zod validation, audit logging, IDOR-safe own-data scoping).
- Conventions for future agents: dialog form reset pattern = key-remount + reset in onOpenChange (NOT setState-in-effect — react-hooks/set-state-in-effect is an error in this repo); openForm auto-open uses deferred setTimeout pattern like attendance/leave views; PROCESSING status needs manual amber className override on StatusBadge (not in STATUS_STYLES).
- NEXT: integration QA (8-d approvals may consume expenses list for manager approvals; payroll tax card links to documents view).

---
Task ID: 8-a
Agent: module-attendance-leave
Task: Attendance / Leave / WFH / On-Duty / Shifts modules — 5 employee-facing views + 5 API route groups.

Work Log:
- src/app/api/attendance/month/route.ts (GET ?year=&month=): full month grid — all days incl. derivation for days without an AttendanceDay record (shift weeklyOff→WO, Holiday→H, approved leave→L, approved WFH/OD→WFH/OD, past→A, future→PENDING); live worked/break minutes for today via computeBreaks+computeWorkedMinutes; summary (present/absent/leave/halfDay/late/wfh/onDuty/weeklyOff/holiday/missingPunch/averageMinutes/payableDays/overtimeMinutes) consistent with desk month summary; includes shiftName, regularized, hasRecord (extra field used by history filter).
- src/app/api/attendance/regularization/route.ts: GET own list (50 newest); POST create — zod (date YYYY-MM-DD past-only, HH:MM in/out, reason ≥3), rejects WO/H days, duplicate PENDING per date, out ≤ in; auto-fills currentCheckIn/out server-side from AttendanceDay; code AR-3xx incrementing (max existing + 1); audit + manager notification.
- src/app/api/leave/route.ts: GET → balances (current year, available = entitled−used−pending) + own requests (50 newest, leaveType name/color, approver name resolved manually — approverId has no Prisma relation) + ?action=substitutes (same-department coworkers for the substitute picker). POST action:create — days = rangeDays × (FULL 1.0 / half 0.5), balance validation INSUFFICIENT_BALANCE, substitute validated, code LR-1xxx incrementing, LeaveBalance.pending += days, currentStage MANAGER, manager notified. POST action:cancel — own PENDING only → CANCELLED + pending reverted (clamped ≥0).
- src/app/api/duty-requests/route.ts: GET own list with ?type=WFH|ON_DUTY filter; POST create (type, subtype required for ON_DUTY, fromDate/toDate?, hours 1-12, reason ≥5, destination/client/contact/address) → code DR-2xx incrementing + manager notification; POST action:cancel own PENDING.
- src/app/api/shifts/route.ts: GET → current shift (resolveShiftForDay, GEN fallback) + 14-day roster from ShiftAssignment (isDefault flag vs GEN for change highlighting), crossesMidnight computed.
- attendance-view.tsx: month Select (last 6 + current), 5 StatCards (Present/Late/Leave/WFH+OD/Avg hours), Monday-first calendar grid with status dots+codes, today ring, click→day detail Dialog (shift/check-in/out/worked/break/OT/late/regularized), legend for all 10 status codes, Daily History table (newest first, sticky header, max-h-96 scroll; hidden md:table + md:hidden card list) filtered to hasRecord/derived-past days, Regularization section with request dialog (past date, prefills requested in/out from the day's recorded punches e.g. yesterday's MP check-in 09:27, out default 18:30, reason ≥3, field errors), own regularization list. Auto-opens on openForm === "regularize".
- leave-view.tsx: balance cards (available big, used/pending mini bars in leave-type color), requests table+cards (type chip, dates+dayMode, days, StatusBadge, stage chip Manager/HR/Completed, decision note tooltip, CANCEL on PENDING → AlertDialog → POST cancel), Apply Leave dialog (type Select with per-type availability, dates, day-mode radios, auto day count + client balance guard, reason ≥5 blur validation, contact, substitute Select from ?action=substitutes, attachment name input, You→Manager→HR chain preview). Auto-opens on openForm "apply"/"leave".
- wfh-view.tsx: WFH policy card, own request list, Request WFH dialog (date, Full/Half duration radios → 8h/4h, reason ≥5, work location, contact) + withdraw flow. Auto-opens on openForm "apply"/"wfh".
- onduty-view.tsx: 6 visit-type explainer chips, own request list, create dialog (subtype, date/end/hours, purpose ≥5, destination, client, notes, contact) + withdraw flow. Auto-opens on openForm "apply"/"onduty".
- shifts-view.tsx: current shift card (big time range, 24h visual bar with shift window + IST now marker + hour grid, grace/break/required/weekly-off InfoRows, type badge), 14-day roster with "Changed vs GEN" highlight + weekly-off chips.
- Conventions: all views use shared kit (PageHeader/SectionCard/StatCard/StatusBadge/EmptyState/DataState/InfoRow), react-query keys ["attendance","month",y,m] / ["regularizations"] / ["leave"] / ["leave","substitutes"] / ["duty","wfh"|"onduty"] / ["shifts"], toasts via sonner, ["desk"] invalidated after mutations, openForm auto-open uses deferred setTimeout (satisfies react-hooks/set-state-in-effect) and accepts both desk ("apply") and topbar quick-create ("leave"/"wfh"/"onduty"/"regularize") trigger values.
- Fixed during verification: approver has no relation on LeaveRequest (manual name resolution), Holiday.companyId nullable type error (conditional spread), duplicate id key in substitute lookup, roster array typing, future PENDING days removed from history table.

Stage Summary:
- All 7 GET endpoints + POST create/cancel flows verified with curl as rohit.patel@niss.tech (login → 200s): month summary present=11/late=4/leave=2/wfh=1/wo=4/h=2/mp=1 with derived days; regularization AR-302/AR-303 created with IST times + all validation errors exercised; leave LR-1089/LR-1090 create → pending increment → cancel → revert verified; DR-211/DR-212 duty create + cancel verified; shifts + roster (14 days, GEN) OK.
- Browser-verified (agent-browser, logged in as Rohit): all 5 views render with no console/page errors; calendar/day-dialog/regularization prefill (09:27/18:30 for MP day); leave apply field validation + full submit LR-1090 + AlertDialog withdraw; WFH/OD dialogs auto-open from topbar quick-create; shifts 24h bar; mobile 390px shows card lists (0 visible tables, 2 md:hidden blocks).
- eslint: 0 errors/warnings in all 10 owned files; tsc --noEmit: 0 errors in owned files.
- Demo DB now contains (from testing): AR-302 PENDING Sep 14, AR-303 PENDING Sep 15, LR-1089/LR-1090 CANCELLED, DR-211 CANCELLED, DR-212 PENDING ON_DUTY Sep 25 — all realistic; missing-punch desk warning for yesterday preserved (no reg for Sep 17).
- NEXT for integration QA: approvals agent should apply Regularization approvals (set regularized=true + appliedCheckIn/out on AttendanceDay) and LeaveRequest finalization (used increment on approval, pending decrement); note LR-1082 was already approved by approvals agent during parallel testing (EL used now 6).

---
Task ID: 8-b
Agent: module-productivity
Task: Tasks, Timesheet, Calendar, Notifications — module APIs (verified pre-existing implementations) + 4 full views (replaced stubs).
Work Log:
- Found the 6 owned API route files already fully implemented in my owned folders (from an interrupted earlier 8-b pass — not logged before). Reviewed each line against the 8-b spec: all match (zod validation, getAuth own-data scoping, ok/badRequest/serverError envelope, force-dynamic, audit logging). Kept as-is after end-to-end verification.
- API /api/tasks: GET own tasks with ?status & ?priority & ?q title search, ordered dueAt asc nulls-last then createdAt desc; POST create {title required, description?, project?, priority, status TODO, dueAt?, progress 0}. /api/tasks/[id]: PATCH own-only partial update (status→COMPLETED sets completedAt=now + progress=100; leaving COMPLETED clears stamp + clamps progress ≤90; progress=100 without status auto-completes); DELETE own task only when TODO else 400 TASK_NOT_DELETABLE.
- API /api/timesheet: GET ?weekStart (default current IST Monday) → {weekStart, weekEnd, days[7] with entries sorted by start, totals{minutes, billableMinutes, byProject[]}, weekStatus (REJECTED>APPROVED-all>SUBMITTED>DRAFT) + rejectionNote + counts}; POST create entry (computes minutes, weekStart=Monday of date, end>start validation) + POST action:"submit-week" (all DRAFT→SUBMITTED with submittedAt, audits count). /api/timesheet/[id]: PATCH/DELETE own DRAFT entries only (NOT_EDITABLE/NOT_DELETABLE otherwise).
- API /api/calendar: GET ?year&month → days{[iso]: events[]} (own CalendarEvents + company events employeeId-null same company + approved LeaveRequests as all-day "On Leave" + own non-completed task due dates type TASK + HOLIDAY from Holiday table + PAYROLL last-working-day-of-month per overlapping month), plus holidays[], birthdays[]/anniversaries[] (same-company, dateOfBirthPublic respected, years≥1), upcoming[] next-7-days agenda, today. Event shape {id,title,type,startAt,endAt,allDay,location,organizer,attendees}; multi-day events bucketed per day; per-day sort all-day first.
- View tasks-view.tsx: PageHeader + New Task; clickable stat chips (All/To Do/In Progress/Blocked/Review/Completed with counts, toggle filters); filter bar (status Select, priority Select, title search Input); task rows = status circle button (lucide Circle/CircleDot/CircleDotDashed/CircleAlert/CheckCircle2, click cycles TODO→IN_PROGRESS→COMPLETED→TODO, BLOCKED/REVIEW advance forward, stopPropagation, spin while pending) + title (strike-through when completed) + project chip + due chip (overdue = danger + "· overdue", "Due today 4:00 pm" / "Due 19 Sept, 5:30 am") + PriorityBadge + thin progress bar with % + assigned by; row click → edit Dialog (title, project, priority Select, due datetime-local (IST↔ISO conversion), status Select (selecting Completed bumps slider to 100), progress Slider 0-100, description); Delete (only TODO, footer of edit dialog) → AlertDialog; create/edit dialog with key-remount + reset-on-close; toasts for create/update/complete/reopen/cycle/delete; auto-opens create dialog for any non-null openForm (deferred setTimeout pattern); list max-h-96 scroll-thin; query keys ["tasks"]+["desk"] invalidated.
- View timesheet-view.tsx: PageHeader + week nav cluster (chevrons, "14 – 20 Sep 2026" label, This week reset disabled on current) + Submit Week button (only when week has DRAFT entries); week status banner (SUBMITTED amber "awaiting manager approval", APPROVED green, REJECTED red + rejectionNote); Mon–Sat day cards (Sunday skipped) with weekday/date/Today chip/day total + per-day "Add entry"; entries = time range (fmtMinutes honors 12h/24h pref) + project chip + task + description + duration + billable ₹ indicator (Non-billable muted) + StatusBadge + edit/delete icon buttons on DRAFT only; totals footer = Total Hours + Billable Hours (with %) StatCards + per-project horizontal mini bars (share of max); Add/Edit entry dialog (date Select of week days default today, project Select Project Alpha/Internal/Support/Training + Other… with free-text, task, description, start/end type="time" inputs, live duration preview, billable Switch, end>start + project validation with field errors); Submit Week AlertDialog → toast "Timesheet submitted for approval"; auto-open via openForm (topbar quick-create "Add Timesheet" verified); keys ["timesheet", weekStart]+["desk"].
- View calendar-view.tsx: PageHeader + month nav (chevrons + "September 2026" + Today); Mon-start 6-row (42-cell) grid, weekday header, out-of-month cells dimmed+disabled, today primary ring + filled day-number pill + Today label; up to 3 event chips per cell (colored dot per type: MEETING #2563EB, TRAINING #8B5CF6, EVENT #F59E0B, HOLIDAY #10B981, LEAVE #0EA5E9, TASK #64748B, PAYROLL #12B76A, BIRTHDAY #EC4899, ANNIVERSARY #F97316, REVIEW #06B6D4; HOLIDAY chips render as green name labels) + "+N more"; cell click → day Dialog with all events (type badge, time range or All day via fmtTime+timeFormat, location/organizer/attendees with MapPin/User/Users icons) + EmptyState when none; right rail (lg only): Upcoming next-7-days agenda (day groups, dot + title + time, Today tag), legend of 10 event types, This Month mini stats (meetings/holidays/birthdays/anniversaries); month state year/month, query key ["calendar", y, m].
- View notifications-view.tsx: uses EXISTING /api/notifications (GET ?unread=1&type=, POST read/read-all); PageHeader + Mark all read (disabled when 0 unread); Tabs All / Unread (count badge) + type Select (Leave/Attendance/Payroll/Task/Announcement/Expense/Approval); rows = colored type icon circle (per-type color + icon: Plane/CalendarClock/IndianRupee/ListTodo/Megaphone/Receipt/ClipboardCheck), title (semibold when unread), body (line-clamp-2), "Type · relativeTime" meta, unread dot, chevron when linked; click → POST mark-read (fire-and-forget with invalidation) + setView(link as ViewKey) navigation; unread rows tinted primary; empty state "You're all caught up."; list max-h-96 scroll-thin; footer count line.
- Verification (curl as rohit.patel@niss.tech): tasks GET 8 items correctly ordered + filters verified (q hit, status, priority); PATCH cycle + completedAt/progress sync verified; DELETE 400 on non-TODO; timesheet GET current week 8 DRAFT entries + totals; create entry + submit-week (8→SUBMITTED) + PATCH/DELETE DRAFT rules verified; calendar GET September (14 event days, holidays 2, birthdays 2, anniversaries 4, upcoming 7 days, payroll 30 Sep) + October (Diwali Break, next payroll); notifications GET 13/10 unread + read/read-all via curl.
- Browser (isolated agent-browser session as Rohit): all 4 views render with zero console/page errors. Tasks: chips/filter/search, circle cycle TODO→IN_PROGRESS (+toast, chip 2→3), edit dialog status→Completed (slider auto-100, chip 1→2, "Completed 18 Sept 100%"), create task (High priority, "Created by you"), empty-title validation, delete AlertDialog flow. Timesheet: week nav prev → amber submitted banner with locked entries, add-entry dialog (date default Fri today, live "3h 30m" duration preview), entry created then deleted, Submit Week AlertDialog → 8 SUBMITTED + banner + button hidden. Calendar: grid with all event types + "+5 more" on 18th, day dialog (8 events with location/organizer/attendees), next-month October + Today reset. Notifications: Unread tab (10, read rows filtered out), Leave type filter (2), row click → mark-read + navigate (payroll & leave views verified). Mobile 390px: all 4 views no horizontal overflow, calendar rail hidden, timesheet rows stack. Quick-create "Add Timesheet" auto-opens entry dialog (openForm pattern).
- All test mutations surgically reverted via Prisma script: current-week timesheet entries back to DRAFT/submittedAt null (seed state), "Verify payroll data" task back to TODO/progress 0, smoke task+entry deleted, notification read flags restored exactly (10 unread), 8 test audit rows removed — demo DB back to seeded state.
- eslint: 0 errors 0 warnings in all 9 owned files (bun run lint passes project-wide). tsc --noEmit: 0 errors in my files (pre-existing errors remain in other agents' files: api/announcements + api/desk Announcement nullable filter, examples/, skills/). dev.log clean.
Stage Summary:
- Tasks / Timesheet / Calendar / Notifications modules fully functional: 4 enterprise views (shared kit, compact density, responsive, scroll-thin lists, toasts, query invalidation) + 6 verified API routes with zod validation, IDOR-safe own-data scoping and audit logging.
- Conventions for future agents: datetime-local ↔ IST ISO conversions live at module level in tasks-view (isoToDateTimeLocal/dateTimeLocalToIso using istTime); minutes↔"HH:MM" in timesheet-view (parseHHMM from time.ts + local fmtMinutes honoring timeFormat pref); event-type color registry EVENT_TYPE_META in calendar-view is the single source for dot/badge/legend colors; notifications links are raw ViewKey strings — cast with `as ViewKey` when calling setView.
- NEXT: integration QA (8-d) — desk MyTasksWidget/upcoming panel share the same ["tasks"]/["desk"] invalidation; approvals module may finalize timesheet weeks (REJECTED banner + decisionNote already supported by GET).

---
Task ID: 8-d
Agent: module-people-manager
Task: People & Manager modules — Directory, Performance, Profile, Settings, Team, Approvals (6 views + 7 API routes incl. approvals/decide decision engine).

Work Log:
- Found all 13 owned files already implemented by an interrupted earlier 8-d pass (like 8-b found). Reviewed every line against the 8-d spec, kept the solid parts, fixed deviations, then verified end-to-end.
- API /api/directory (GET ?q&dept): same-company non-SEPARATED employees {empCode/name/designation/dept/branchCity/email/phone/skills/managerName} searchable by name/email/empCode/designation (server-side filter) + departments list.
- API /api/performance (GET): own goals + progress% (min-unit goals computed as target/current — lower is better) + summary {active, completed, atRisk, avgProgress, total}. /api/performance/[id] (PATCH {current}): own goal only (404 otherwise), zod ≥0, clamped to target, auto-COMPLETED at target (back to ACTIVE when lowered below), GOAL_PROGRESS_UPDATED audit.
- API /api/profile: GET full own profile (personal/employment w/ yearsOfService/contact/bank masked •••• 4311 + PAN masked/skills/education/experience parsed from JSON). PATCH whitelist phone/address/emergencyName/emergencyPhone/skills (zod phone regex, ≤30 skills); any restricted field (bank/tax/designation/dept/manager/role/…) → 400 RESTRICTED_FIELD "Contact HR to change restricted fields"; PROFILE_UPDATED audit.
- API /api/settings: GET {theme, timeFormat, dateOfBirthPublic, notifPrefs, sessions} + PATCH same (zod enums); notifPrefs persisted in Employee.widgetPrefs JSON via raw SQL (ensurePrefsColumn ALTER TABLE + Prisma.sql read/write — column already added to SQLite, no schema change since schema.prisma is foundation-owned); SETTINGS_UPDATED audit. (Renamed response key widgetPrefs→notifPrefs for spec compliance this pass.)
- API /api/team (manager+ else 403): today's direct-report snapshot — live worked/break/OT minutes via computeBreaks for in-flight days, shift from day row or ShiftAssignment fallback (Night Shift case), badge precedence L/WFH/OD/H/WO > WORKING/ON_BREAK/CHECKED_OUT/NOT_STARTED, summary {total,working,onBreak,leave,wfh,notCheckedIn,checkedOut,avgMinutes}.
- API /api/approvals (manager+ else 403): GET ?tab leave|duty|attendance|timesheet|expense — pending items where requester.managerId = me (HR additionally sees HR-stage leaves + FINANCE_APPROVED expenses payable queue), counts for all tabs + total. Timesheets grouped per week+employee with entries/totals; noMatch impossible-filter pattern keeps count queries branch-free.
- API /api/approvals/decide (manager+ else 403, zod, single id or ids[] batch ≤50): authorization requester.managerId === me (leave at HR stage also HR/admin; expense finance stages HR). leave approve@MANAGER→currentStage HR + notify; approve@HR→APPROVED + decidedAt/note + LeaveBalance used+=days, pending-=days + notify; reject→REJECTED + pending-=days + notify. duty approve/reject→status + decidedAt/note + notify. attendance(Regularization) approve→APPROVED + appliedCheckIn/Out=requested + AttendanceDay(employee+date) upsert: punches from requested, gross/net recomputed (gross − existing breakMinutes), OT, status "P", state, regularized=true, remark "Regularized via <code>" + notify; reject→REJECTED + notify. timesheet approve/reject→all entry statuses + decidedAt (+note) + aggregated per-employee notify. expense approve→MANAGER_APPROVED if decider is requester's manager else (HR/finance) FINANCE_APPROVED (fixed this pass to use manager relation, not role), pay (HR only, FINANCE_APPROVED only)→PAID+paidAt, reject→REJECTED — all + notify. Every decision audited (DUTY_APPROVED/LEAVE_APPROVED/ATTENDANCE_APPROVED/TIMESHEET_APPROVED/EXPENSE_APPROVED/EXPENSE_PAID).
- Views (all shared kit, responsive, scroll-thin, sonner toasts, query invalidation): directory-view (debounced search + dept Select, card grid with Initials/role/city/mailto+copy-email toast, click → detail Dialog w/ skills — converted from Sheet this pass, count + privacy note); performance-view (4 StatCards, goal rows w/ category chip/progress bar/due overdue-red/StatusBadge, ACTIVE+AT_RISK "Update progress" button → Dialog with slider → PATCH w/ optimistic cache update — converted from inline slider this pass, quarter Select, Self Review card); profile-view (Tabs Personal/Employment/Contact/Bank&Tax/Skills&Education; Personal edit session for phone/address/emergency w/ validation, read-only dob/gender/empCode; Employment read-only + Managed-by-HR + Request change→helpdesk; masked bank/PAN w/ locks; skills chips add/remove via PATCH + education/experience lists); settings-view (theme radio setTheme immediate + PATCH, 12h/24h radio PATCH + store setTimeFormat, DOB-privacy Switch, 3 notifPrefs toggles, session card + Sign out POST /api/auth/logout→reload); team-view (manager guard EmptyState, 6 summary StatCards, desktop table + mobile stacked cards, max-h-[60vh] scroll-thin, refetchInterval 60s + refresh button); approvals-view (manager guard, 5 Tabs w/ count badges, per-type detail rows incl. attendance current→requested punch arrows, decision Dialog w/ comment textarea + processing states, invalidates ["approvals"]+["desk"]).
- curl verification as anita.desai (MANAGER): /api/team 13 members (5 working/1 break/1 leave/1 WFH/5 not-checked-in, avg 460m, live minutes); /api/approvals all 5 tabs (counts 2/2/2/2/1 = 9 incl. DR-212); decide flows exercised: duty DR-212 approve (KEPT — realistic demo data), leave LR-1086 manager-approve→HR queue→payal final approve (balance used 0→2), attendance AR-302 approve (day Sep-14 L→P, punches 9:28am/6:35pm, gross/net 547, OT 37, regularized remark), expense EX-519 manager→MANAGER_APPROVED→HR finance→FINANCE_APPROVED→pay→PAID (non-HR pay attempt → 400), timesheet week batch approve 12 entries + notify; notifications + audits verified at every hop. Employee isolation rohit.patel: /api/team, /api/approvals, decide → 403 FORBIDDEN. performance PATCH clamp 150→100 + auto-COMPLETED, zod negative→400, foreign id→404. profile PATCH restricted designation/PAN→400 RESTRICTED_FIELD, allowed phone/skills→200 + audit, bad phone→zod 400. settings GET/PATCH notifPrefs+timeFormat round-trip, bad theme→400. All test mutations surgically reverted (leave/balance/reg/attendance-day/expense/timesheet back to seed state, 11 test notifs + 19 test audit rows deleted; DR-212 approval intentionally kept per task instructions; also restored 1 leftover APPROVED timesheet entry from the interrupted pass back to SUBMITTED).
- Browser smoke (agent-browser, isolated sessions): anita — Team view (table + refresh + live summary), Approvals all 5 tabs + reject Dialog open/cancel; rohit — Performance goal dialog slider→PATCH (reverted), Directory search + detail Dialog w/ skills, Settings all cards + weekly-summary toggle on/off round-trip, Profile all 5 tabs + Personal Edit toggle (readonly→editable→cancel), mobile 390px Team view (0 visible tables, stacked cards, no overflow). Zero console/page errors.
- eslint: 0 errors 0 warnings in all 13 owned files (bun run lint now passes project-wide). tsc --noEmit: 0 errors in owned files (pre-existing errors remain in other agents' files: api/announcements, api/desk, layout.tsx toaster prop, desk/widgets). dev.log clean.

Stage Summary:
- People & Manager modules complete: 6 enterprise views + 7 API routes with the full approvals decision engine (leave 2-stage w/ balance effects, duty, attendance regularization day rewrite, timesheet weeks, expense manager→finance→pay chain), all with zod validation, getAuth IDOR scoping, audit logs and requester notifications.
- Conventions for future agents: approvals decide accepts {id} or {ids[]} batches (timesheet weeks decided atomically); Employee.widgetPrefs is a raw-SQL JSON column (Prisma unaware — keep using readPrefs/writePrefs helpers if more widget prefs needed); team badge precedence: day status (L/WFH/OD/H/WO) overrides live state; Radix tabs in browser tests need `find role tab click` (synthetic .click() on [role=tab] doesn't switch).
- NEXT: integration QA — all 19 module views + APIs now implemented; final pass should verify cross-module flows (desk widgets ↔ module queries invalidation, notifications links → views) and can consider a prisma migration for widgetPrefs column.

---
Task ID: 9-11 (integration, QA, release)
Agent: main (Z.ai Code)
Task: Integration wiring, full browser QA via agent-browser, TypeScript fixes, footer fix, DB re-seed, release checks.

Work Log:
- Fixed TypeScript errors in foundation files: nullable companyId guards in /api/desk + /api/announcements, removed invalid `rich` prop on sonner Toaster, Number() cast in widgets.tsx. tsc --noEmit: 0 errors in app source (examples/ + skills/ scaffold folders excluded — pre-existing).
- Fixed sticky footer: main is now `flex flex-col` with content wrapper `flex-1`; footer sticks to viewport bottom on short pages (verified 1300/1300px) and is pushed naturally on long pages (verified 1130px at 900px viewport).
- QA via agent-browser (desktop 1440px + mobile 390px + 1300px):
  - Login via demo account button → desk renders: greeting, hero (WORKING state + live timer), 2 warning banners (missing punch yesterday + policy ack), 5 summary cards, timeline, upcoming + holiday + celebrations + assets, weekly hours, tasks, month summary (11 Present/2 Leave/1 WFH/4 Late/1 MP), leave balances + upcoming leave, announcements with Acknowledge, welcome toast.
  - Break flow: Take Break → dialog (5 break types) → On Break state + toast → End Break → Working state + toast. Live timer verified.
  - Checkout dialog: summary shown, early-exit warning with required reason, Continue Checkout disabled until reason ≥3 chars (spec compliance).
  - All 20 views render with correct headings: desk, attendance, shifts, leave, wfh, onduty, tasks, timesheet, calendar, notifications, payroll, expenses, documents, helpdesk, directory, performance, profile, settings, team, approvals.
  - Manager experience (Anita): Team Today + Pending Approvals widgets on desk; Approvals inbox tabs (Leave 2/WFH&OD 1/Attendance 2/Timesheets 2/Expenses 1); approve with comment → "1 item approved" toast, count 2→1 (manager stage → HR stage), employee received "Leave forwarded to HR" notification; Team view live statuses.
  - Employee isolation: rohit.patel on /api/team and /api/approvals → 403 (RBAC verified).
  - Mobile: bottom nav (Desk/Attendance/Calendar/Requests/More), More sheet with all modules, zero horizontal overflow (scrollWidth check true).
  - Dark mode: theme cycle system→dark verified via html class.
  - Command palette ⌘K: navigation options + quick actions + search; quick-create menu auto-opens module forms (WFH dialog verified).
  - Payslip dialog renders (Gross Earnings/Total Deductions), console clean (only HMR + one Radix DialogContent aria warning).
- Re-seeded DB for pristine demo state (fresh live day, no test artifacts).
- bun run lint: 0 errors/warnings project-wide.

Stage Summary:
- GOLDEN PATH FULLY VERIFIED IN BROWSER: login → desk → live attendance (break cycle) → all modules → manager approvals → notifications → mobile/dark/footer.
- All 4 module agents (8-a..8-d) completed; all APIs respond 200; state machine, RBAC, IDOR isolation, notifications, audit logs working.
- App is production-ready for demo: seeded data with 26 employees, live workday, 40+ API endpoints, 20 views.

Unresolved / Notes:
- Radix a11y warning: some dialogs lack DialogDescription (cosmetic console warning only).
- examples/ + skills/ scaffold folders have pre-existing TS errors (not part of app; excluded from Next build).
- Re-seed resets DB; if the sandbox crosses midnight, attendance engine auto-creates the new day row (getOrCreateDay) so the app stays functional.

---
Task ID: 12 (release)
Agent: main (Z.ai Code)
Task: Package and publish the completed My Desk HRMS to github.com/rohitsaket/mydesk; final QA.

Work Log:
- Repo hygiene: wrote .gitignore (excludes node_modules/.next/logs/.env/db binaries/sandbox artifacts), .env.example (DATABASE_URL=file:../db/custom.db), renamed package to mydesk-hrms v1.0.0, added db:seed + one-command setup scripts.
- README.md: premium project presentation — highlights table (attendance engine, leave approvals, timesheets, payroll, expenses, calendar, helpdesk, performance, manager center, ⌘K palette), demo accounts, quick start, architecture map, scripts.
- Cleaned tracked files: git rm --cached .env Caddyfile db/custom.db tool-results/ examples/ tests/ download/ upload/ .zscripts mini-services (sandbox infra — never pushed to GitHub; no secrets in repo).
- Committed "My Desk v1.0 — premium enterprise HRMS release" (e71a612) and pushed to https://github.com/rohitsaket/mydesk.git (origin/main with token auth, public repo, 149 files).
- Post-release QA (agent-browser): login session persists; desk renders greeting + WORKING live timer + missing-checkout banner; Tasks view switch OK; sticky footer exact (docH=winH=1300, no gap/overlap); mobile 390px zero horizontal overflow; zero page errors; only known cosmetic Radix DialogTitle a11y warnings.

Stage Summary:
- PROJECT RELEASED: full codebase live on GitHub at rohitsaket/mydesk (main @ e71a612). App verified working in browser after packaging.
- Remote origin configured with token in local .git/config (never committed) so future automated commits can push.
- Working tree is now the release state: demo DB seeded, dev server on :3000.

Unresolved / Notes for next phase:
- Radix DialogTitle/Description a11y warnings (cosmetic) — fix by adding aria-describedby={undefined} or DialogDescription to bare Dialogs.
- Consider prisma migration for widgetPrefs raw-SQL column (settings notifPrefs).
- Sandbox-crossing-midnight: attendance engine auto-creates new day rows (already handled by getOrCreateDay).
- Recurring 15-min webDevReview cron created to continue QA + feature polish autonomously.

---
Task ID: 13 (webDevReview round 1)
Agent: main (Z.ai Code)
Task: Scheduled review — QA sweep, a11y fix, NEW Insights analytics module (API + view + nav).

Work Log:
- QA: app stable post-release; dev server had crashed mid-session (stale module-not-found from a transient broken file state) — restarted via setsid .zscripts/dev.sh (survives shell exit; plain nohup got reaped).
- FIXED Radix a11y warnings (documented since v1.0): payslip DialogContent now always renders a DialogTitle (placeholder while loading, real header when loaded) + aria-describedby={undefined}; verified in browser — payslip dialog opens with ZERO console warnings (was: "requires DialogTitle" + "Missing Description").
- NEW MODULE — Insights (personal analytics): 
  - API GET /api/insights (getAuth-scoped, IDOR-safe): last-30-day attendance trend (worked hours/OT per day), status distribution, punctuality (on-time %, avg late, median arrival IST, early exits), attendance streak (skips WO/H), task throughput (6 ISO weeks created vs completed + overdue), timesheet by project (6 weeks, hours + billable split), leave balances (typed colors, available/entitled), payroll trend (last 3 payslips via period relation — Prisma relation orderBy needs ARRAY form [{period:{year}},{period:{month}}]), and auto-generated highlights with tones.
  - View insights-view.tsx: 4 StatCards (On-Time %, Avg Workday, Streak, Tasks Completed), gradient accent rule, recharts AreaChart (worked hours, gradient fill, 8.5h shift ReferenceLine), 2 donuts (attendance mix + leave balance with center totals), BarChart (task throughput), animated project bars (billable segment solid + non-billable 30% opacity), net pay trend (₹ INR formatting), highlights grid + 4 micro-stats; staggered animate-in entrances (tw-animate-css).
  - Wired: ViewKey "insights" + InsightsPayload types, MAIN_NAV position 2 (BarChart3 icon), VIEW_TITLES (auto: sidebar + bottom-nav More sheet + ⌘K palette), app-shell dynamic import.
- GOTCHAS SOLVED (conventions for future agents): (1) recharts 2.15.4 + React 19 types break next/dynamic LoaderComponent inference — import recharts modules via `dynamic(() => import(...).then((m) => m.NamedExport))`; (2) a file with unbalanced backticks (template literal) makes tsc report confusing syntax errors at LATER lines — audit with `src.count(chr(96)) % 2`; (3) framer-motion v12 imports ALSO poison dynamic() module typing in this setup — prefer tw-animate-css classes (animate-in fade-in slide-in-from-bottom-2 + animationDelay inline style).
- QA (browser): login → Insights renders all 7 sections with real data (57% on-time, 7.8h avg, 18P/4WO/4L mix, ₹77.9k/₹75.6k pay trend, 3 auto-highlights); 5 recharts wrappers (2 areas, 2 pies, 12 bars, refline) verified via DOM count; VLM visual review of light+dark screenshots: "no overlapping/cut-off/broken areas, harmonious palette, well-optimized dark mode"; mobile 390px zero overflow; desk/tasks regression pass; console + page errors CLEAN.
- bunx tsc --noEmit: 0 app errors (only pre-existing examples/ + skills/ scaffold). bun run lint: passes.

Stage Summary:
- App now has 21 views / 41 API route groups. Insights module = flagship premium analytics feature, fully theme-adaptive (charts use CSS var tokens).
- Radix a11y warnings RESOLVED (last known cosmetic issue from v1.0).

Unresolved / Notes for next phase:
- Consider adding insights deep-link from desk (e.g. "View insights" button on a desk stat card).
- Punctuality insight for demo user shows 57% — consider seeding slightly better data or an explanatory hint (median arrival 9:40 AM vs 9:30 shift).
- Widget prefs (notifPrefs) still raw-SQL column; prisma migration pending (low priority).

---
Task ID: 14 (webDevReview round 2)
Agent: main (Z.ai Code)
Task: Scheduled review — QA + NEW Announcements module (view + API fix), Timesheet CSV export, Desk→Insights quick action; corrected prior dynamic-import diagnosis.

Work Log:
- QA: app stable, all views render, console clean. Found gap: announcements existed only as desk widget — no dedicated view.
- API FIX /api/announcements: `acknowledged` was hardcoded 0 (dead un-awaited count query) — now awaits Promise.all of per-announcement ack counts; Foundation Day correctly returns 1.
- NEW Announcements view (announcements-view.tsx, 22nd view): filter chips (All + Needs-your-ack amber + per-category with counts), feed cards with priority left-accent borders (CRITICAL red / IMPORTANT amber), category icon medallions, level labels (All Company/Branch/…), relative timestamps, clamp-3 + Read more/Show less for long bodies, Acknowledge mutation (pending spinner → toast → state flip → invalidates ["announcements"]+["desk"]), acknowledged counts footer, "For your information" for non-ack items, staggered animate-in, scroll-thin max-height list. Wired into ViewKey/MAIN_NAV (after Help Desk, Megaphone icon)/VIEW_TITLES/app-shell (auto: sidebar, mobile More, ⌘K).
- Desk wiring: widget "View all announcements" now navigates to announcements view (was workaround → notifications); QuickActions gains "Insights" as 8th tile (fills grid; form now optional in action type).
- NEW Timesheet CSV export: Export CSV button (visible when week has entries) — client-side Blob with BOM, quoted CSV of Date/Day/Project/Task/Description/Start/End/Hours/Billable/Status + TOTAL row, download as timesheet-{weekStart}.csv, success toast.
- CORRECTED prior round's diagnosis (important for conventions): the "recharts/framer-motion break next/dynamic" conclusion was WRONG — real rule: next/dynamic module loaders REQUIRE A DEFAULT EXPORT (ComponentModule = { default: ComponentType }). All 20 existing views use `export default function XxxView()`; my named exports caused the failures. Insights + Announcements now use default exports; app-shell back to plain dynamic() (dropped .then(m=>m.X)). framer-motion's earlier "poisoning" was the same named-export issue — animate with tw-animate-css remains fine either way.
- QA (browser as rohit.patel): Announcements renders 4 cards + 6 chips; filter Policy → 1 card, All → 4; Acknowledge click → toast + "Acknowledged" state (test ack surgically reverted via Prisma — desk policy banner intact); API ack counts verified (1 for Foundation Day); Timesheet Export CSV captured via blob monkey-patch — timesheet-2026-09-14.csv with 10 columns + 9 entries + TOTAL; desk QuickActions "Insights" tile → Insights view; desk "View all announcements" → Announcements view; mobile 390px zero overflow; VLM visual review: "clean, no visual defects, correct accent borders"; console + page errors clean; tsc 0 app errors; lint passes.

Stage Summary:
- 22 views / 42 API route groups. Announcements module complete (view + fixed counts API). Timesheet gains CSV export. Desk links to Insights.
- CONVENTION (critical): every view file MUST `export default function XxxView()` for next/dynamic — no named-only exports.

Unresolved / Notes for next phase:
- Read-more threshold (180 chars) — seed bodies are short; consider seeding one longer announcement to showcase expansion.
- Announcements feed could add HR/Admin "compose" capability (currently read-only for employees — by design for demo).
- widgetPrefs raw-SQL column migration still pending (low priority).

---
Task ID: 15 (webDevReview round 3)
Agent: main (Z.ai Code)
Task: Scheduled review — QA sweep + NEW Announcements compose/delete management (HR/Admin) + login page premium styling pass.

Work Log:
- QA sweep (agent-browser, employee session): login → desk → 6 views navigated (Announcements/Insights/Payroll/Tasks/Performance/Directory), zero page errors, mobile 390px zero horizontal overflow, footer intact. App stable.
- NEW FEATURE — Announcements management (HR/Admin only):
  - API POST /api/announcements action:"compose" — zod validation (title 5-120, body 10-2000, level/category/priority enums, requiresAck), RBAC 403 for non-HR/Admin, creates announcement + ANNOUNCEMENT_PUBLISHED audit, returns item in GET shape.
  - API action:"delete" — RBAC + company scoping, cascade removes acks, ANNOUNCEMENT_DELETED audit.
  - UI: "New announcement" button (PenLine) in PageHeader (HR/Admin only, via useHrmsStore employee.role); Compose Dialog with title/body Inputs (live char counters + min-length hints + aria-invalid), Category Select (5 options with icons), Audience Select, Priority radiogroup chips (color-coded NORMAL/IMPORTANT/CRITICAL with explanatory hints), requiresAck Switch; Publish disabled until valid; on success → toast + invalidate ["announcements"]+["desk"] + form reset.
  - Remove control on each card (HR/Admin only) → inline two-step confirm ("Delete"/"Keep") → deleteMutation + toast.
- Seeded a longer showcase announcement ("Annual performance review cycle opens Monday", 600+ chars, IMPORTANT) to demonstrate Read more/Show less expansion; added to prisma/seed.ts AND surgically inserted into live DB via one-off script (no re-seed).
- STYLING PASS — login page premium upgrade:
  - Brand panel: animated aurora blobs (pulse 7s/9s offset), bottom fade gradient, logo shadow glow, LIVE clock chip (updates every second, ping dot + tabular-nums + long date), gradient text on "One Workspace." (sky-300→white), feature rows hover translate-x micro-interaction, brand stats strip (22 modules · 26 colleagues · 40+ API endpoints).
  - Form panel: demo account cards now have role-tinted initials avatars (RP primary/AD success/PM warning/VS danger), hover lift (-translate-y-0.5 + shadow), arrow slide-in on hover; Sign In button gains ↵ kbd hint.
- QA VERIFIED (browser): employee sees NO compose/remove controls; HR sees both; compose dialog renders all controls; publish disabled→enabled validation gating verified; published card shows IMPORTANT/Event/needs-ack correctly; delete two-step confirm works; RBAC API employee compose → 403 FORBIDDEN; Read more/Show less expansion verified; "Showing 5 of 5"; mobile 390px zero overflow; desk regression OK; zero console/page errors; dev.log clean (403 + 200s as expected).
- VLM visual reviews: login page — "polished, high-fidelity design ready for production, no fixes required"; announcements feed — "clean, no critical defects".
- Test data cleanup: both test announcements + 4 test audit rows removed via surgical Prisma script; DB left with 5 announcements (4 seed + 1 showcase).
- bunx tsc --noEmit: 0 app errors. bun run lint: passes.

Stage Summary:
- 22 views / 42 API route groups. Announcements module now fully manageable by HR/Admin (compose + delete with audit trail), employees read-only with ack flow.
- Login page elevated to premium marketing-grade design with live clock, stats strip and micro-interactions.

Unresolved / Notes for next phase:
- Compose currently publishes instantly; could add "scheduled/pinned" announcements or rich formatting (markdown) later.
- widgetPrefs raw-SQL column migration still pending (low priority).
- Consider Insights deep-link from the new performance-review announcement (already mentions the module in copy).
---
Task ID: 16 (webDevReview round 4)
Agent: main (Z.ai Code)
Task: Scheduled review — QA sweep + NEW Payslip PDF export (server-side pdf-lib, branded) + keyboard shortcuts system + StatCard styling polish.

Work Log:
- QA sweep: server healthy (200), all views render, console clean. Debunked a stale console error from last round (announcements-view parse error was a transient mid-write Fast Refresh state; file on disk was correct, verified in browser). No real bugs found → feature round.
- QA gotcha documented: synthetic KeyboardEvents must be dispatched on document.body (window-dispatched events never reach document-level listeners); `?`/g-shortcut tests use body dispatch. Also `agent-browser set viewport <w> <h>` is the viewport command.
- NEW FEATURE — Payslip PDF export (server-side, premium):
  - Vendored pyftsubset cuts of DejaVuSans + Bold (~20KB each, ASCII + en-dash + ₹ U+20B9; license file included) into assets/fonts/ — kept tiny by pre-subsetting with fonttools instead of pdf-lib runtime subsetting (avoids the known pdf-lib subset CIDToGIDMap blank-glyph issue in Acrobat).
  - `bun add pdf-lib @pdf-lib/fontkit` (fontkit REQUIRED for custom font embedding — first run 500'd with "no fontkit instance" until pdf.registerFontkit(fontkit)).
  - New module src/lib/hrms/pdf/payslip-pdf.ts: branded A4 layout — primary header band (company + PAYSLIP + period), status chip (PAID green/PROCESSING amber), employee grid card, side-by-side Earnings/Deductions tables with tinted headers + aligned rows + totals, NET PAYABLE band with Indian words ("Rupees Seventy Five Thousand Five Hundred Eighty Only"), 3-cell summary strip (Payable/LOP/OT), confidential footer with IST stamp. Indian digit grouping (₹12,34,567), tx() sanitizer whitelists subset glyphs, all strings width-measured for right alignment.
  - API: /api/payroll/[id]?download=1 now returns the PDF (was text) — same auth/IDOR scoping + PAYSLIP_DOWNLOAD audit; filename Payslip-<Month>-<Year>-<empcode>.pdf; ~36KB output.
  - Frontend: payslip dialog button "Download PDF"; per-row FileDown icon in history table (stopPropagation, aria-labels); "PDF" quick-action on Latest Payslip hero card.
  - Verified: curl download (valid %PDF-1.7, 36083 bytes), pdftotext content check (all sections + ₹ correct), VLM review of rendered page: "No issues. Layout clean, columns well-aligned, ₹ renders correctly, no overlap/clipping."
- NEW FEATURE — Keyboard shortcuts system:
  - Global keydown in command-palette.tsx: `?` (when not typing & no dialog open) opens ShortcutsHelp dialog; gmail-style `g`+key navigation (900ms pending window) to Desk/Insights/Attendance/Calendar/Leave/Tasks/Payroll/Notifications/Settings; typing guard (input/textarea/select/contentEditable targets) + dialog-open guard.
  - New component shortcuts-help.tsx: kbd-chip rows grouped Global/Jump-to, footer "Try it" chips (all 9 modules, click = navigate) — restacked vertically after VLM flagged footer crowding (initial flex layout squeezed text to 42px/4 lines).
  - Command palette gains "Keyboard shortcuts" item (searchable) + footer tip line now mentions `?`.
  - Verified: g+p→Payroll, g+i→Insights, g+d→Desk; ? opens/closes (Esc); palette entry opens dialog; typing guard (g+p in Directory search input stays put); Try-it buttons navigate.
- STYLING: shared StatCard (used across all views) gains group + hover:-translate-y-px + hover:border-primary/25 + hover:shadow-md + icon chip bg; payroll hero grid cells gain muted bg + hover borders + gradient top-rule on Net Pay cell.
- Verification: bunx tsc --noEmit 0 app errors; bun run lint passes; mobile 390px Insights zero horizontal overflow (scrollW=390); dark mode clean; desktop 1440 regression (desk/payroll/directory) OK; zero fresh console/page errors; dev.log clean (only the pre-fix fontkit 500).
- Cleanup: 3 test PAYSLIP_DOWNLOAD audit rows surgically removed (AuditLog field is `details`, not `detail` — model uses details). README updated (PDF export + shortcuts in highlights table and shortcut list).
- Committed + pushed to github.com/rohitsaket/mydesk (origin/main with token auth in .git/config).

Stage Summary:
- 22 views / 42 API route groups. Payroll gains real branded PDF payslips; app gains a full keyboard shortcuts layer (help + jump navigation); StatCards polished app-wide.
- New deps: pdf-lib + @pdf-lib/fontkit. New repo assets: assets/fonts/DejaVuSans{,-Bold}.ttf (~20KB subset cuts) + DejaVu-LICENSE.txt.
- CONVENTIONS: custom-font PDF embedding needs registerFontkit(fontkit); pre-subset fonts with pyftsubset (unicodes U+0020-007E,U+2013,U+20B9) to keep PDFs small; sanitize all PDF strings through tx() (missing glyphs throw at encode time).

Unresolved / Notes for next phase:
- Document model has no expiresAt — expiry alerts would need schema change (skipped this round by design).
- widgetPrefs raw-SQL column migration still pending (low priority).
- PDF payslip could add company logo image embedding (pdf-lib embedPng) if a logo asset is ever produced.
- Possible next features: announcements pinning/scheduling, helpdesk SLA timers, team drill-down dialogs.
---
Task ID: 17 (webDevReview round 5)
Agent: main (Z.ai Code)
Task: Scheduled review — CRITICAL FIX: dev-restart DB wipe (schema drift) + re-seed + NEW Documents expiry alerts + a11y fix.

Work Log:
- QA found the app BROKEN: login 401 for every account. Root cause: database completely empty (0 users/employees, tables intact). Timeline: DB file mtime 14:56 matched a fresh dev.sh start in dev.log.
- ROOT CAUSE: .zscripts/dev.sh runs `bun run db:push` → `prisma db push --accept-data-loss` on EVERY dev-server start. The Employee.widgetPrefs column (added by raw SQL in an earlier round, unknown to schema.prisma) created schema drift → Prisma recreated the drifted tables → --accept-data-loss silently wiped ALL data. Any dev restart could nuke the DB.
- FIX (root cause, 3 layers):
  1. schema.prisma: Employee.widgetPrefs String? (JSON) now schema-managed + Document.expiresAt DateTime? added — pushes are purely additive forever.
  2. package.json: db:push no longer passes --accept-data-loss (added db:push:force alias for explicit manual use) — future drift fails LOUDLY in dev.log instead of silently wiping.
  3. settings route rewritten: raw SQL (ensurePrefsColumn/readPrefs/writePrefs) replaced by parsePrefs() + plain db.employee.update({ data: { widgetPrefs } }) — no more raw-schema mutations from app code.
- RESTORE: bun run db:push (additive, 41ms) + bun run db:seed — 26 users/employees back; login works. VERIFIED the fix live: restarted the dev server via dev.sh (which runs db:push) → data survived (26 users intact, widgetPrefs column present).
- QA re-run of settings notifPrefs through the new Prisma path: PATCH notifWeekly true → response + DB Employee.widgetPrefs JSON persisted → revert OK.
- NEW FEATURE — Documents expiry alerts:
  - Schema: Document.expiresAt (optional). Seed: Employee ID Card expires in 24d (amber), Group Mediclaim Policy Card expired 12d ago (red, uploaded 370d ago — annual policy narrative), Passport Scan valid 420d.
  - API /api/documents: returns expiry {status: valid|expiring|expired, daysLeft, date} per doc (30-day warn window, server-computed) + summary {total, withExpiry, expiring, expired}.
  - View documents-view.tsx: amber alerts strip (counts + one-click attention filter, aria-pressed, toggles styling), urgency-sorted grid (expired → expiring → recent), ExpiryBadge chips (red/amber with icons + title tooltip), cards get danger/warning border tints + hover lift, dialog shows "Expires" InfoRow with full badge + contextual renewal/reissue guidance alert (darker contrast per VLM feedback), EmptyState variant when filter on.
- STYLING: card hover lift/borders in documents grid; expiry color system (danger red / #B54708 amber light + warning-token dark mode variants).
- A11Y: bottom-nav More sheet was missing a description (Radix DialogContent warning) — added sr-only SheetDescription; verified 0 fresh warnings via console.warn interceptor.
- VLM reviews: documents view "No real defects found; layout clean, text readable"; expired + expiring dialogs "no visual defects". Initial VLM pass flagged mediclaim uploaded-after-expiry confusion (fixed: upload date now 370d ago, coherent annual policy) + alert contrast (fixed with darker tones).
- Regression: desk/insights (5 charts)/payroll PDF (36KB valid)/announcements (5, long showcase present)/settings all pass; mobile 390px documents view zero overflow; console clean; tsc 0 app errors; lint passes.
- Housekeeping: git config core.fileMode false (sandbox chmod +x noise on unrelated files would pollute commits).
- Committed + pushed to github.com/rohitsaket/mydesk.

Stage Summary:
- CRITICAL DATA-WIPE BUG FIXED AND VERIFIED (schema aligned, flag removed, raw SQL eliminated, live restart test passed).
- 22 views / 42 API route groups. Documents module gains expiry lifecycle (alerts, filtering, urgency sort, renewal guidance).
- CONVENTION (critical for all future agents): NEVER ALTER DB SHAPE VIA RAW SQL — add columns to prisma/schema.prisma (SQLite-friendly: String for JSON, DateTime? for optional dates). dev.sh runs db:push on every restart; drift + old --accept-data-loss flag caused the round-5 wipe.

Unresolved / Notes for next phase:
- If DB is ever wiped again: bun run db:seed restores in ~30s (all demo state incl. round-3 showcase announcement).
- Documents expiry could feed a desk widget or notification (e.g., "ID card expires in 24 days" notification in seed) — natural next enhancement.
- Ideas backlog: team drill-down dialogs, helpdesk SLA timers, announcements pinning, payslip PDF logo embedding.
---
Task ID: 18 (webDevReview round 6)
Agent: main (Z.ai Code)
Task: Scheduled review — exhaustive dialog a11y audit + NEW document-expiry desk banner (tone-aware) + DOCUMENT notification type.

Work Log:
- QA: server healthy, DB intact (26 users — round-5 fix holding through restarts), session persisted. All views render, zero fresh console errors.
- EXHAUSTIVE A11Y AUDIT: armed a console.warn interceptor and opened every dialog in the app — break, checkout, task create, leave apply, WFH request, on-duty request, expense claim, timesheet entry, regularize, attendance day detail, calendar day detail, helpdesk raise + ticket detail, directory person, performance goal update, payslip, notifications popover, create menu, profile edit (account menu → My Profile) — ALL 17+ dialogs produce 0 fresh warnings. The lingering console entry was confirmed stale (persisted from round-5 pre-fix More-sheet state; browser session log is cumulative).
- NEW FEATURE — Document expiry surfaces on the Desk (completes the round-5 expiry feature loop):
  - types.ts: warnings entries gain optional tone: "warning" | "danger".
  - Desk API: queries own documents with expiresAt ≤ today+30d (take 3, asc) → pushes a document-expiry warning: danger tone when any expired (title "2 documents need attention", message "1 expired (Group) · 1 expiring soon — review and renew with HR"), else warning tone with nearest doc name + days-left countdown. Link → documents.
  - WarningBanners (desk/widgets.tsx): tone-aware design system — amber variant (existing) + red danger variant (danger-soft bg, #A32424 text, dark-mode #F87171), per-tone CircleAlert/AlertTriangle icons, animate-in fade+slide entrance, context-aware CTA ("Review" for documents, "Fix Now" otherwise).
  - Notifications: new DOCUMENT type (FileBadge icon, teal #14B8A6) in TYPE_META + type filter list. Seed gains 2 notifications (Mediclaim expired, ID card expires in 24 days); same pair inserted surgically into live DB (2 DOCUMENT rows confirmed in API, unread 6).
- Verified end-to-end in browser: desk shows all 3 banners (amber missing-punch, amber ack, RED documents); "Review" CTA navigates to Documents; notifications view shows both DOCUMENT rows with "Document ·" labels; type filter Document → "Showing 2 notifications"; topbar popover shows Mediclaim notification; dark mode banner bg rgb(46,21,18) renders correctly.
- VLM reviews: notifications doc-filter view "No real defects found"; desk banners light+dark "No real defects found" (one false-positive "cut off" claim disproven by DOM geometry — banner bottom 288px < 900px viewport).
- Regression: tsc 0 errors, lint passes, mobile 390px zero overflow + red banner visible, console clean.
- Committed + pushed to github.com/rohitsaket/mydesk.

Stage Summary:
- 22 views / 42 API route groups. Documents expiry now surfaces in 3 places: Documents view (round 5), Desk warning banner (danger/warning tone), and notifications (new DOCUMENT type).
- Desk warnings upgraded from uniform amber to a 2-tone design system with animations and contextual CTAs.
- A11y fully audited: every dialog in the app is warning-free.

Unresolved / Notes for next phase:
- Notifications API could accept a `type` param server-side (currently filters client-side via query param — verify; the view passes ?type= and it works, so server-side filtering already exists).
- Ideas backlog: team drill-down dialogs, helpdesk SLA timers, announcements pinning, payslip PDF logo embedding, weekly digest notification seed.
- The stale a11y console entry may reappear in `agent-browser console errors` output (cumulative session log) — it predates round 5's fix; fresh-warning interceptors confirm 0 occurrences.
---
Task ID: 19 (webDevReview round 7)
Agent: main (Z.ai Code)
Task: Scheduled review — QA sweep (clean) + NEW Helpdesk first-response SLA system (live countdowns, breach states, urgency sort, SLA stats).

Work Log:
- QA sweep (agent-browser, employee session): server healthy, DB intact (26 users — round-5 fix still holding), all 15 views render with 0 fresh console errors (armed console.error + pageerror interceptors), mobile 390px zero overflow (payroll + helpdesk). Verified mobile bottom-nav "Requests" tab = helpdesk (earlier suspicion of a missing Help Desk entry in the More sheet was a false alarm — it is the 4th primary tab). No bugs found → feature round.
- NEW FEATURE — Helpdesk first-response SLA system:
  - New lib src/lib/hrms/sla.ts: SLA policy (URGENT 4h / HIGH 8h / NORMAL 48h / LOW 72h), pure slaState() (ON_TRACK | AT_RISK | BREACHED | MET | MISSED — at-risk when remaining < max(15% of target, 2h)), countdown/response labels, fmtDurationMs ("41h 59m" / "2d 6h"), slaSummary() (open/breached/atRisk/avgFirstResponseHours/metRatePct).
  - API /api/hr-tickets (collection + [id]): mapTicket now attaches slaDueAt (createdAt + target) + firstResponseAt (first non-"You" comment); GET returns server-computed summary. NO schema change — SLA derived from existing comments + createdAt (zero migration risk by design).
  - View helpdesk-view.tsx:
    - useNow(30s) live clock — countdowns tick in real time (verified "Overdue by 2h" → "2h 6m" across a session).
    - SlaChip on every ticket card: gray on-track "Due in 41h", amber pulsing at-risk "Due in 3h", red "Overdue by 2h", green "Responded in 30m", red-muted missed. tabular-nums, tooltip with policy.
    - Open tickets sorted by urgency: BREACHED → AT_RISK → ON_TRACK (soonest due) → responded. Breached cards get danger border tint, at-risk amber tint.
    - Section header stats: "1 breached · 1 due soon · 67% responses in SLA" chips.
    - Ticket dialog SLA panel: pending → progress bar (elapsed vs target, primary/amber/red) + live countdown + due date/time + assignee; breached → overdue escalation copy; responded → "First response in 30m — within the 4 hours SLA (13% of target)" MET/MISSED result card. Footer copy now dynamic per priority.
    - Create dialog: priority radios (2x2 grid) each show "~4 hours response" SLA hint + policy footnote; description mentions live SLA tracking.
    - FAQ gains "What are the response SLAs?" entry with the full policy table.
  - Card hover lift polish (hover:-translate-y-px + shadow-md) consistent with StatCard.
- Seed: 3 showcase tickets added (HR-1048 HIGH breached ~2h overdue, HR-1039 NORMAL at-risk 3h left, HR-1033 URGENT closed MET in 30m) + same 3 surgically inserted into live DB (idempotent script, insert-sla-tickets.ts). Rohit now demos all 5 SLA states.
- E2E verified in browser: raised URGENT ticket via UI (HR-1051) → appeared instantly with "Due in 4h" chip → deleted with its audit rows (cleanup script; AuditLog filter fields are entity/entityId).
- VLM reviews: desktop SLA chips ("clean, professional, high visual hierarchy"), breached dialog ("professional, free of technical rendering errors"), dark dialog + mobile (PASS; one mobile chip-width warning disproven by DOM overflow test 390=390), create dialog initially flagged REAL bug — 4-col priority grid truncated "~2 business days response" — FIXED to 2x2 grid, re-verified equal 195x49 cards, single-line hints, VLM "Pass".
- Regression: desk greeting + round-6 document banners intact, tsc 0 app errors, lint passes, mobile 390px zero overflow, dark mode clean, console clean, dev.log clean.

Stage Summary:
- 22 views / 42 API route groups. Helpdesk upgraded with a full first-response SLA layer: live countdown chips, 5-state color system, urgency-sorted queue, dialog SLA panels with progress bars, create-time expectation setting, and summary stats.
- New lib src/lib/hrms/sla.ts (client+server safe, pure functions). No schema migration needed.
- CONVENTION: SLA state is derived (createdAt + priority + first non-employee comment) — never stored; client recomputes live from slaDueAt/firstResponseAt so countdowns work between fetches.

Unresolved / Notes for next phase:
- HR-1039's due time renders "12:00 am" (createdAt math lands at midnight IST) — factually correct but a more natural business-hour due time would need seed time adjustments; consider shifting if it bothers reviewers.
- Assignee responses are seed-only (no agent simulation) — new tickets raised by users will realistically count down toward due; a future "simulate IT response" dev tool could demo MET live.
- Ideas backlog: team drill-down dialogs, announcements pinning, payslip PDF logo embedding, weekly digest notification seed, resolution-SLA (needs resolvedAt column).
