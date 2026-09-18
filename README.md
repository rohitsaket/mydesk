# My Desk 🖥️

**A premium, full-stack enterprise HRMS — your entire workday on one screen.**

My Desk is an employee self-service portal for a modern organization: live attendance with breaks and overtime, a two-stage leave approval engine, WFH & on-duty workflows, timesheets, payroll, expenses, a shared calendar, a helpdesk, performance goals, and a manager command center — all wrapped in a polished, responsive, dark-mode-capable interface.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma (SQLite) · TanStack Query · Zustand · Framer Motion**.

---

## ✨ Highlights

| Area | What you get |
| --- | --- |
| **Live attendance** | Immutable punch event log → derived day state machine (`NOT_STARTED → WORKING → ON_BREAK → CHECKED_OUT`) with live timers, break types, early-exit guard with mandatory reason, late/early/overtime math per shift |
| **Leave engine** | Two-stage approvals (Manager → HR), quota balances with carry-forward, half-day modes, substitute assignment, status timeline |
| **Duty requests** | Unified WFH & On- Duty with subtypes (client visit, field, training…), approval chain with notifications |
| **Timesheets** | Weekly grid, draft → submit → approve/reject, billable split, per-project rollups |
| **Payroll** | Payroll periods, full payslip breakdown (earnings/deductions/OT/LOP), payslip dialog, branded **PDF payslip export** (₹ formatting, amount in words, one-click from dialog/history) |
| **Expenses** | Category claims with receipt metadata, Manager → Finance → Paid lifecycle |
| **Documents** | Personal + company-wide document vault with confidentiality levels and **expiry alerts** (expired/expiring-soon banners, urgency sort, renewal guidance) |
| **Calendar** | Month grid merging meetings, trainings, company events, holidays, leaves, task due dates, payroll days, birthdays & anniversaries |
| **Helpdesk** | HR/IT/Facilities/Payroll/Admin tickets with priorities, comment threads, and **first-response SLA tracking** — per-priority targets (Urgent 4h → Low 3 days), live countdown chips, breach/at-risk badges, urgency sorting, and SLA stats (met rate, avg response) |
| **Performance** | Quarterly goals with progress tracking, auto-completion at target, self-review |
| **Manager center** | Team-today live board, approvals inbox (5 tabs) with single/batch decisions, every decision audited & notified |
| **Directory & profile** | Searchable people directory, self-service profile with restricted-field guards, masked bank/PAN data |
| **Command bar** | ⌘K command palette for navigation + quick actions, quick-create menu, notifications with deep links, keyboard shortcuts (`?` cheatsheet, `g`+key jump navigation) |

**20 views, 40+ API endpoints, 28 database models** — role-based access (Employee / Manager / HR / Admin), IDOR-safe scoping, zod validation, audit logs, and toast + notification feedback everywhere.

## 🔐 Demo accounts

Password for all accounts: **`demo123`**

| Role | Email | Notes |
| --- | --- | --- |
| Employee | `rohit.patel@niss.tech` | Hero user — working today, missing punch yesterday |
| Manager | `anita.desai@niss.tech` | Tech manager with direct reports & approvals |
| HR | `payal.mehta@niss.tech` | Final-stage leave approvals, payroll |
| Admin | `vikram.shah@niss.tech` | Full access |

The seed also creates 22 more employees across 3 branches and 5 departments, with 45 days of attendance history, live today-states, leaves, tasks, payslips, expenses, tickets, goals and announcements.

## 🚀 Quick start

```bash
# 1. Install & set up the database (one command)
bun run setup
#    ↑ = install deps + create .env + generate client + push schema + seed demo data

# 2. Start the dev server
bun run dev
```

Open <http://localhost:3000> and log in with a demo account above.

<details>
<summary>Manual steps / other package managers</summary>

```bash
cp .env.example .env        # DATABASE_URL → file:../db/custom.db
bun install                 # or npm install
bunx prisma generate
bunx prisma db push
bun prisma/seed.ts          # or: bun run db:seed
bun run dev
```
</details>

## 🧭 Using the app

- **Desk** — greeting + hero attendance card (punch in/out, breaks, live timer), summary cards, today's timeline, tasks widget, upcoming events, celebrations, announcements to acknowledge.
- **Attendance** — day timeline, punch history, regularization requests for missed punches.
- **Requests** — leave (balances + apply), WFH, on-duty, each with status tracking.
- **Tasks / Timesheet / Calendar / Notifications** — full module views.
- **Payroll / Expenses / Documents / Helpdesk** — financial & service modules.
- **Directory / Performance / Profile / Settings** — people modules.
- **Team / Approvals** — manager-only command center.
- **⌘K** — command palette anywhere; **quick-create (+)** in the top bar jumps straight into any module's form; **?** — keyboard shortcut cheatsheet; **g** then a key (e.g. `g p`) — jump straight to a module.

## 🏗️ Architecture

```
src/
├── app/
│   ├── page.tsx              # single user-facing route — SPA shell
│   ├── layout.tsx            # fonts, providers (theme, react-query, toaster)
│   ├── globals.css           # design tokens (light/dark), enterprise palette
│   └── api/                  # 24 route groups, 40+ endpoints
│       ├── auth/             # login/logout/me (scrypt + session cookie)
│       ├── attendance/       # today, punch, break, history, regularize
│       ├── leave/ duty-requests/ approvals/decide
│       ├── timesheet/ payroll/ expenses/ documents/ hr-tickets/
│       ├── calendar/ directory/ performance/ profile/ settings/
│       ├── team/ search/ desk/ notifications/ announcements/ …
├── components/
│   ├── hrms/                 # app views, shared UI kit, widgets
│   └── ui/                   # shadcn/ui primitives
└── lib/
    ├── hrms/                 # auth (getAuth, ok/badRequest/…), api client, time/IST utils
    └── db.ts                 # Prisma client singleton
prisma/
├── schema.prisma             # 28 models
└── seed.ts                   # deterministic, realistic demo dataset
```

**Conventions** — one route (`/`), views switched client-side via Zustand; every API uses `getAuth()` for session context (never trusts client IDs); responses use a consistent `{ success, data | error }` envelope; SQLite means string enums with zod validation at the edge.

## 🛠️ Scripts

| Command | Purpose |
| --- | --- |
| `bun run setup` | Install + env + generate + push + seed |
| `bun run dev` | Dev server on port 3000 |
| `bun run lint` | ESLint (Next.js + TS rules) |
| `bun run db:push` | Sync schema to SQLite |
| `bun run db:seed` | Re-seed demo data |

## 📄 License

Demo project — © 2026 My Desk.
