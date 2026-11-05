# Staff Check

Team, attendance and leave management for small and medium businesses (up to 100 people), run as a multi-tenant service: each client company gets its own isolated workspace, and a **super admin dashboard** manages those clients.

Built with Next.js (App Router), Drizzle ORM on Neon Postgres, Better Auth and Tailwind, trimmed to what a small business needs — no biometric devices, no payroll engine, no stores. Locations are **branches** (office or field) and people are grouped into **departments**.

## Who can do what

| Role | Scope | Can |
|---|---|---|
| **Super admin** | Platform | Create / edit / suspend client companies, set plan and seat limit, reset a company admin's password. Cannot see company data. |
| **Admin** | Own company | Everything below, plus company logins and the audit log. |
| **HR** | Own company | Employees, branches, departments, attendance, leave decisions, reports. |
| **Accountant** | Own company | Read-only: employees, attendance, leave, monthly report + CSV export (payroll input). |
| **Manager** | Own team (direct reports) | See their team, mark team attendance, decide team leave. |

Anyone whose login is linked to a staff record can check in/out (field staff may share location) and request leave.

Tenant isolation is enforced in code, not just in the UI: every query is scoped by `companyId`, every server action calls `can()` first, and client-supplied branch / department / manager ids are verified to belong to the caller's company (`src/lib/tenant/refs.ts`).

## Getting started

```bash
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate          # applies the committed migrations in src/db/migrations
npm run db:seed             # creates the super admin (and a demo company with SEED_DEMO=1)
npm run dev
```

Sign in as the super admin, add a client company, and share the one-time admin password it shows (once). Every new login must set its own password on first sign-in.

> Change the schema in `src/db/schema`, then `npm run db:generate` to create a migration and commit it.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests for permissions, tenant scoping, attendance maths, leave days, CSV safety |
| `npm run type-check` | `tsc --noEmit` |
| `npm run db:generate` / `db:migrate` / `db:seed` | Drizzle: generate a migration from `src/db/schema`, apply migrations, seed |

## Data and auth

- **Drizzle ORM on Postgres.** Schema in `src/db/schema`, migrations committed in `src/db/migrations`. The app uses the pooled `DATABASE_URL` (`src/db/index.ts`, 5 s connection timeout, `DB_POOL_MAX`); `db:migrate` uses `DIRECT_URL`.
- **Better Auth** (`src/lib/auth/server.ts`): email + password, database-backed cookie sessions, public sign-up off. Logins are created with `createLogin` (`src/lib/auth/users.ts`). Removing a login or suspending a company revokes live sessions. `src/lib/session.ts` re-reads the user on every request and enforces the one-time-password change.
- **Tenant scoping**: start every tenant query with `inCompany(table, companyId)` / `employeeFilter(actor)` (`src/lib/tenant/sql.ts`).
- **Data layer skeleton** (`src/lib/data`): circuit breaker, tenant placement, Cloudinary account choice and outbox replay, the pieces of the balancer in the spec. MongoDB and Cloudinary clients arrive with the attendance phase.
- **Onboarding** (`/onboarding`, `/onboarding/review`): a 5-step details wizard for any login linked to a staff record, with HR / admin review. Aadhaar, PAN, UAN, ESIC and bank account numbers are AES-256-GCM encrypted (`src/lib/crypto.ts`, key in `KYC_ENCRYPTION_KEY`) and shown only as the last 4 digits. Document uploads arrive with Cloudinary.
- **Leave policy and balances** (`/leave/policy`, admin / HR): yearly days per leave type per company (blank = unlimited; defaults 12 casual, 12 sick, 15 paid, unpaid unlimited until a policy is saved). A request that exceeds the remaining balance (approved + pending, counted in the year it starts) is refused. Logic in `src/lib/leave/balance.ts`.
- **Notifications** (`/notifications`): `notify()` in `src/lib/notify` writes an in-app notification and, when given a template, sends the email too. Leave requests notify the employee's manager (or all HR / admin logins when there is no manager login); decisions notify the employee. Mail or notification failures are logged and never block the action.
- **Notification settings** (`/notifications/settings`): each login turns in-app and email on or off per event; `notify()` honours it (default: both on).
- **Leave emails** (`/leave/emails`, admin / HR): a company can reword the two leave emails using {{placeholders}} (`src/lib/mail/custom.ts`); blank means the built-in wording.
- **Payroll** (`/payroll`, admin and accountant run it, HR views, managers never see it): set each person's monthly salary at `/payroll/salary`, then create one run per month. Pay = salary x paid days / working days (Mon-Sat), from attendance: present 1, half day 0.5, on leave 1, absent 0. People with unmarked days are flagged, and finalizing needs an explicit tick. PF, ESIC and a flat professional tax are off until turned on at `/payroll/settings`. All money is integer paise (`src/lib/payroll/`). Finalizing locks the run and its payslips, and database triggers (migration 0009) enforce it. Employees see finalized payslips at `/payslips`. The payout sheet (`/payroll/YYYY-MM/payout`, .xlsx) holds full account numbers, only for approved onboarding, and every download is audited.
- Needs Node 20.9+.

## Layout

```
src/app/(auth)        login, change password
src/app/(app)         company workspace: dashboard, employees, attendance, leave, branches,
                      departments, reports (+CSV), logins, audit log
src/app/platform      super admin: overview, companies, activity
src/lib/auth/can.ts   the permission matrix (single gate for every action)
src/lib/tenant        company scoping, headcount limits, timezone helpers
```

## Limits and notes

- Seat limit per company (default by plan: 25 / 50 / 100) counts **active** employees and can never exceed 100.
- A suspended company's users are signed out within about a minute; data is kept.
- Trial end dates are shown on the platform dashboard but not enforced automatically yet.
- Sundays are the weekly off day in working-day and leave calculations.
