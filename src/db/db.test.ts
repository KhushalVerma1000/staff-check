import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { and, eq } from 'drizzle-orm';
import * as s from './schema';
import { employeeFilter } from '@/lib/tenant/sql';

/** drizzle wraps the Postgres error; the reason is on `cause`. */
function rejectsWith(p: Promise<unknown>, re: RegExp) {
  return assert.rejects(p, (e: unknown) => re.test(String((e as { cause?: unknown }).cause ?? e)));
}

/** Real Postgres (in-process) with the committed migrations applied. */
async function fresh() {
  const db = drizzle(new PGlite(), { schema: s });
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  return db;
}

test('migrations apply and tenant filters isolate companies and teams', async () => {
  const db = await fresh();
  const [a, b] = await db.insert(s.company).values([{ name: 'A', slug: 'a' }, { name: 'B', slug: 'b' }]).returning();
  const joinedOn = new Date('2026-01-01');
  const [boss, rep1] = await db
    .insert(s.employee)
    .values([
      { companyId: a.id, code: 'E-0001', name: 'Boss', joinedOn },
      { companyId: a.id, code: 'E-0002', name: 'Rep', joinedOn },
    ])
    .returning();
  await db.update(s.employee).set({ managerId: boss.id }).where(eq(s.employee.id, rep1.id));
  await db.insert(s.employee).values([
    { companyId: a.id, code: 'E-0003', name: 'Other team', joinedOn },
    { companyId: b.id, code: 'E-0001', name: 'Other company', joinedOn },
  ]);

  const names = async (actor: Parameters<typeof employeeFilter>[0]) =>
    (await db.select({ n: s.employee.name }).from(s.employee).where(employeeFilter(actor)).orderBy(s.employee.name)).map((r) => r.n);

  assert.deepEqual(await names({ id: 'u', role: 'HR', companyId: a.id, employeeId: null }), ['Boss', 'Other team', 'Rep']);
  assert.deepEqual(await names({ id: 'u', role: 'MANAGER', companyId: a.id, employeeId: boss.id }), ['Boss', 'Rep']);
  assert.deepEqual(await names({ id: 'u', role: 'MANAGER', companyId: a.id, employeeId: null }), []);
  assert.deepEqual(await names({ id: 'u', role: 'ADMIN', companyId: b.id, employeeId: null }), ['Other company']);
});

test('employee codes are unique per company, not globally', async () => {
  const db = await fresh();
  const [a, b] = await db.insert(s.company).values([{ name: 'A', slug: 'a' }, { name: 'B', slug: 'b' }]).returning();
  const joinedOn = new Date('2026-01-01');
  await db.insert(s.employee).values({ companyId: a.id, code: 'E-0001', name: 'x', joinedOn });
  await db.insert(s.employee).values({ companyId: b.id, code: 'E-0001', name: 'y', joinedOn });
  await assert.rejects(db.insert(s.employee).values({ companyId: a.id, code: 'E-0001', name: 'dup', joinedOn }));
});

test('one attendance row per employee per day', async () => {
  const db = await fresh();
  const [a] = await db.insert(s.company).values({ name: 'A', slug: 'a' }).returning();
  const [e] = await db.insert(s.employee).values({ companyId: a.id, code: 'E-1', name: 'x', joinedOn: new Date('2026-01-01') }).returning();
  const row = { companyId: a.id, employeeId: e.id, date: new Date('2026-10-05'), status: 'PRESENT' as const };
  await db.insert(s.attendanceRecord).values(row);
  await db
    .insert(s.attendanceRecord)
    .values({ ...row, status: 'HALF_DAY' })
    .onConflictDoUpdate({ target: [s.attendanceRecord.employeeId, s.attendanceRecord.date], set: { status: 'HALF_DAY' } });
  const rows = await db.select().from(s.attendanceRecord).where(and(eq(s.attendanceRecord.employeeId, e.id)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'HALF_DAY');
});

test('branch geofence columns round-trip and are optional', async () => {
  const db = await fresh();
  const [a] = await db.insert(s.company).values({ name: 'A', slug: 'a' }).returning();
  const [plain] = await db.insert(s.branch).values({ companyId: a.id, name: 'Plain' }).returning();
  const [fenced] = await db
    .insert(s.branch)
    .values({ companyId: a.id, name: 'Fenced', latitude: 18.52, longitude: 73.85, radiusM: 150 })
    .returning();
  assert.equal(plain.radiusM, null);
  assert.deepEqual([fenced.latitude, fenced.longitude, fenced.radiusM], [18.52, 73.85, 150]);
});

test('punch events record refused attempts without touching attendance', async () => {
  const db = await fresh();
  const [a] = await db.insert(s.company).values({ name: 'A', slug: 'a' }).returning();
  const [e] = await db.insert(s.employee).values({ companyId: a.id, code: 'E-1', name: 'x', joinedOn: new Date('2026-01-01') }).returning();
  await db.insert(s.punchEvent).values({ companyId: a.id, employeeId: e.id, kind: 'IN', outcome: 'OUTSIDE_GEOFENCE', distanceM: 420 });
  const punches = await db.select().from(s.punchEvent);
  assert.equal(punches.length, 1);
  assert.equal(punches[0].outcome, 'OUTSIDE_GEOFENCE');
  assert.equal((await db.select().from(s.attendanceRecord)).length, 0);
});

test('only one pending correction per person per day; a decided one frees the slot', async () => {
  const db = await fresh();
  const [a] = await db.insert(s.company).values({ name: 'A', slug: 'a' }).returning();
  const [e] = await db.insert(s.employee).values({ companyId: a.id, code: 'E-1', name: 'x', joinedOn: new Date('2026-01-01') }).returning();
  const row = { companyId: a.id, employeeId: e.id, date: new Date('2026-10-05'), requestedStatus: 'PRESENT' as const, reason: 'forgot to check in' };
  const [first] = await db.insert(s.attendanceCorrection).values(row).returning();
  await assert.rejects(db.insert(s.attendanceCorrection).values(row));
  await db.update(s.attendanceCorrection).set({ status: 'REJECTED' }).where(eq(s.attendanceCorrection.id, first.id));
  await db.insert(s.attendanceCorrection).values(row); // a new request is allowed again
});

test('leave policy is one row per company and type; notifications follow the login and company', async () => {
  const db = await fresh();
  const [a, b] = await db.insert(s.company).values([{ name: 'A', slug: 'a' }, { name: 'B', slug: 'b' }]).returning();
  await db.insert(s.leavePolicy).values({ companyId: a.id, type: 'CASUAL', annualDays: 10 });
  await db.insert(s.leavePolicy).values({ companyId: b.id, type: 'CASUAL', annualDays: null });
  await assert.rejects(db.insert(s.leavePolicy).values({ companyId: a.id, type: 'CASUAL', annualDays: 5 }));

  const [u] = await db.insert(s.user).values({ name: 'Hr', email: 'hr@a.test', role: 'HR', companyId: a.id }).returning();
  await db.insert(s.notification).values({ companyId: a.id, userId: u.id, kind: 'leave.requested', title: 'x' });
  const unread = await db.select().from(s.notification).where(and(eq(s.notification.userId, u.id), eq(s.notification.companyId, a.id)));
  assert.equal(unread.length, 1);
  assert.equal(unread[0].readAt, null);

  await db.delete(s.user).where(eq(s.user.id, u.id));
  assert.equal((await db.select().from(s.notification)).length, 0);
});

test('notification preferences are one row per login and event', async () => {
  const db = await fresh();
  const [a] = await db.insert(s.company).values({ name: 'A', slug: 'a' }).returning();
  const [u] = await db.insert(s.user).values({ name: 'Hr', email: 'hr@a.test', role: 'HR', companyId: a.id }).returning();
  await db.insert(s.notificationPref).values({ companyId: a.id, userId: u.id, kind: 'leave.requested', email: false });
  await assert.rejects(db.insert(s.notificationPref).values({ companyId: a.id, userId: u.id, kind: 'leave.requested' }));
  await db.insert(s.notificationPref).values({ companyId: a.id, userId: u.id, kind: 'leave.decided' });
});

test('a company has at most one custom email per event', async () => {
  const db = await fresh();
  const [a, b] = await db.insert(s.company).values([{ name: 'A', slug: 'a' }, { name: 'B', slug: 'b' }]).returning();
  await db.insert(s.emailTemplate).values({ companyId: a.id, kind: 'leave.decided', subject: 's', body: 'b' });
  await db.insert(s.emailTemplate).values({ companyId: b.id, kind: 'leave.decided', subject: 's', body: 'b' });
  await assert.rejects(db.insert(s.emailTemplate).values({ companyId: a.id, kind: 'leave.decided', subject: 'x', body: 'y' }));
});

test('a finalized payroll run and its payslips are locked by the database itself', async () => {
  const db = await fresh();
  const [a] = await db.insert(s.company).values({ name: 'A', slug: 'a' }).returning();
  const [e] = await db.insert(s.employee).values({ companyId: a.id, code: 'E1', name: 'Asha', joinedOn: new Date('2026-01-01') }).returning();
  const slip = { companyId: a.id, employeeId: e.id, employeeCode: 'E1', employeeName: 'Asha', workingDays: 25, paidDays: 25 };

  const [run] = await db.insert(s.payrollRun).values({ companyId: a.id, month: '2026-10' }).returning();
  await assert.rejects(db.insert(s.payrollRun).values({ companyId: a.id, month: '2026-10' })); // one run per month
  const [p] = await db.insert(s.payslip).values({ ...slip, runId: run.id, netPaise: 100 }).returning();
  await db.update(s.payslip).set({ netPaise: 200 }).where(eq(s.payslip.id, p.id)); // draft: editable

  await db.update(s.payrollRun).set({ status: 'FINALIZED', finalizedAt: new Date() }).where(eq(s.payrollRun.id, run.id));
  await rejectsWith(db.update(s.payslip).set({ netPaise: 999 }).where(eq(s.payslip.id, p.id)), /finalized/);
  await rejectsWith(db.update(s.payrollRun).set({ status: 'DRAFT' }).where(eq(s.payrollRun.id, run.id)), /finalized/);
  const [e2] = await db.insert(s.employee).values({ companyId: a.id, code: 'E2', name: 'Ravi', joinedOn: new Date('2026-01-01') }).returning();
  await rejectsWith(db.insert(s.payslip).values({ ...slip, employeeId: e2.id, employeeCode: 'E2', runId: run.id }), /finalized/);
  assert.equal((await db.select().from(s.payslip).where(eq(s.payslip.id, p.id)))[0].netPaise, 200);

  await db.delete(s.company).where(eq(s.company.id, a.id)); // deleting a whole company still works
  assert.equal((await db.select().from(s.payslip)).length, 0);
});

test('a payroll run is built from salary, attendance and the company switches', async () => {
  const { buildRunLines } = await import('@/lib/payroll/run');
  const db = await fresh();
  const [a, b] = await db.insert(s.company).values([{ name: 'A', slug: 'a' }, { name: 'B', slug: 'b' }]).returning();
  const early = new Date('2026-01-01');
  const [asha, ravi, newbie, other] = await db
    .insert(s.employee)
    .values([
      { companyId: a.id, code: 'E1', name: 'Asha', joinedOn: early },
      { companyId: a.id, code: 'E2', name: 'Ravi', joinedOn: early },
      { companyId: a.id, code: 'E3', name: 'No salary', joinedOn: early },
      { companyId: b.id, code: 'X1', name: 'Other company', joinedOn: early },
    ])
    .returning();
  await db.insert(s.salaryStructure).values([
    { companyId: a.id, employeeId: asha.id, basicPaise: 20_000_00, hraPaise: 8_000_00, otherPaise: 2_000_00 },
    { companyId: a.id, employeeId: ravi.id, basicPaise: 10_000_00 },
    { companyId: b.id, employeeId: other.id, basicPaise: 99_999_00 },
  ]);
  await db.insert(s.payrollSettings).values({ companyId: a.id, pfEnabled: true, professionalTaxPaise: 200_00 });

  // Nov 2026 has 25 Mon–Sat days. Asha: 24 present + 1 absent (a Sunday record is ignored). Ravi: marked on 10 days only.
  const days: Date[] = [];
  for (let d = 1; d <= 30; d++) if (new Date(Date.UTC(2026, 10, d)).getUTCDay() !== 0) days.push(new Date(Date.UTC(2026, 10, d)));
  await db.insert(s.attendanceRecord).values([
    ...days.map((date, i) => ({ companyId: a.id, employeeId: asha.id, date, status: (i === 0 ? 'ABSENT' : 'PRESENT') as 'ABSENT' | 'PRESENT' })),
    { companyId: a.id, employeeId: asha.id, date: new Date(Date.UTC(2026, 10, 1)), status: 'PRESENT' as const },
    ...days.slice(0, 10).map((date) => ({ companyId: a.id, employeeId: ravi.id, date, status: 'PRESENT' as const })),
  ]);

  const { lines, withoutSalary } = await buildRunLines(a.id, '2026-11', db as never);
  assert.deepEqual(lines.map((l) => l.employeeCode), ['E1', 'E2']);
  assert.deepEqual(withoutSalary.map((w) => w.id), [newbie.id]);

  const [l1, l2] = lines;
  assert.equal(l1.workingDays, 25);
  assert.equal(l1.paidDays, 24);
  assert.equal(l1.unmarkedDays, 0);
  assert.equal(l1.grossPaise, 2_880_000); // 30,000 × 24/25
  assert.equal(l1.pfPaise, 180_000); // 12% of ceiling ₹15,000 (earned basic 19,200 is above it)
  assert.equal(l1.ptPaise, 20_000);
  assert.equal(l1.netPaise, 2_880_000 - 180_000 - 20_000);

  assert.equal(l2.paidDays, 10);
  assert.equal(l2.unmarkedDays, 15);
  assert.equal(l2.grossPaise, 400_000); // 10,000 × 10/25
  assert.equal(l2.pfPaise, 48_000); // 12% of 4,000
});
