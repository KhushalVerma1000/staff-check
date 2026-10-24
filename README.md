# Staff Check

Team, attendance and leave management for small and medium businesses (up to 100 people), run as a multi-tenant service: each client company gets its own isolated workspace, and a **super admin dashboard** manages those clients.

Built on the same stack as the HRMS project (Next.js App Router, Prisma, Auth.js, Tailwind), trimmed to what a small business needs — no biometric devices, no payroll engine, no stores. Locations are **branches** (office or field) and people are grouped into **departments**.

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
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET (openssl rand -base64 32)
npm install                 # also runs `prisma generate`
npx prisma migrate dev --name init   # first run only: creates the initial migration
npm run db:seed             # creates the super admin (and a demo company with SEED_DEMO=1)
npm run dev
```

Sign in as the super admin, add a client company, and share the one-time admin password it shows (once). Every new login must set its own password on first sign-in.

> The first migration is not committed yet: it has to be generated against a real Postgres database with `prisma migrate dev`. Commit the generated `prisma/migrations/` folder after running it.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests for permissions, tenant scoping, attendance maths, leave days, CSV safety |
| `npm run type-check` | `tsc --noEmit` |
| `npm run db:generate` / `db:migrate` / `db:deploy` / `db:seed` | Prisma (see below) |

## Prisma 7

The project runs on Prisma 7, which changed a few things worth knowing:

- **Connection URLs live in `prisma.config.ts`**, not in `schema.prisma`. The CLI (migrate, studio) uses `DIRECT_URL` — a direct, non-pooled connection. The running app uses `DATABASE_URL` (the pooled one) through the `@prisma/adapter-pg` driver adapter in `src/lib/prisma.ts`. Locally they can be the same URL.
- **The client is generated into `src/generated/prisma`** (gitignored) and imported from `@/generated/prisma/client`. `npm install` and `npm run build` regenerate it; run `npm run db:generate` after editing the schema.
- **`migrate dev` no longer generates the client or seeds automatically.** Run `npm run db:generate` and `npm run db:seed` yourself.
- The Postgres driver pool is configured with a 5-second connection timeout (node-postgres has none by default). If your provider uses a self-signed certificate and you see error `P1010`, fix the CA trust rather than disabling verification.
- Needs Node 20.19+.

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
