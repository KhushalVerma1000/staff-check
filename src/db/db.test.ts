import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { and, eq } from 'drizzle-orm';
import * as s from './schema';
import { employeeFilter } from '@/lib/tenant/sql';

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
