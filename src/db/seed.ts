/**
 * Seed: the platform owner (always) and an optional demo company.
 *   SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD   required
 *   SEED_DEMO=1                                         also create "Demo Traders" with one login per role
 * Safe to re-run: existing rows are left alone (passwords are never overwritten).
 * Standalone on purpose: own pool, no '@/lib/env', so it needs only DATABASE_URL.
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createLogin } from '../lib/auth/users';
import * as schema from './schema';

const { branch, company, department, employee, user } = schema;

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set.');
const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });

async function ensureUser(data: {
  email: string;
  name: string;
  role: schema.Role;
  password: string;
  companyId?: string;
  employeeId?: string;
}) {
  const [existing] = await db.select().from(user).where(eq(user.email, data.email)).limit(1);
  if (existing) return existing;
  return createLogin(
    {
      email: data.email,
      name: data.name,
      role: data.role,
      password: data.password,
      companyId: data.companyId ?? null,
      employeeId: data.employeeId ?? null,
      mustChangePassword: data.role !== 'SUPER_ADMIN',
    },
    db,
  );
}

async function main() {
  const email = process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD.');
  if (password.length < 10) throw new Error('SEED_SUPERADMIN_PASSWORD must be at least 10 characters.');
  await ensureUser({ email, name: 'Platform Admin', role: 'SUPER_ADMIN', password });
  console.log(`Super admin ready: ${email}`);

  if (process.env.SEED_DEMO !== '1') return;

  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'Demo-pass-2026';
  let [co] = await db.select().from(company).where(eq(company.slug, 'demo-traders')).limit(1);
  if (!co) {
    [co] = await db
      .insert(company)
      .values({ name: 'Demo Traders', slug: 'demo-traders', status: 'ACTIVE', plan: 'STARTER', employeeLimit: 25 })
      .returning();
    await db.insert(branch).values([
      { companyId: co.id, name: 'Head office', type: 'OFFICE', city: 'Pune', isHeadOffice: true },
      { companyId: co.id, name: 'Field team', type: 'FIELD' },
    ]);
    await db.insert(department).values(['Accounts', 'Sales', 'Operations'].map((name) => ({ companyId: co.id, name })));
  }
  const companyId = co.id;
  const [head] = await db
    .select()
    .from(branch)
    .where(and(eq(branch.companyId, companyId), eq(branch.isHeadOffice, true)))
    .limit(1);
  const [sales] = await db
    .select()
    .from(department)
    .where(and(eq(department.companyId, companyId), eq(department.name, 'Sales')))
    .limit(1);
  if (!head || !sales) throw new Error('Demo company is missing its head office or Sales department.');

  const mk = async (code: string, name: string, extra: { managerId?: string; designation?: string } = {}) => {
    const [existing] = await db
      .select()
      .from(employee)
      .where(and(eq(employee.companyId, companyId), eq(employee.code, code)))
      .limit(1);
    if (existing) return existing;
    const [row] = await db
      .insert(employee)
      .values({ companyId, code, name, branchId: head.id, departmentId: sales.id, joinedOn: new Date('2026-01-05'), ...extra })
      .returning();
    return row;
  };

  const mgr = await mk('E-0001', 'Meera Manager', { designation: 'Sales Manager' });
  const rep = await mk('E-0002', 'Ravi Rep', { designation: 'Sales Executive', managerId: mgr.id });
  await mk('E-0003', 'Sana Sales', { designation: 'Sales Executive', managerId: mgr.id });

  const pw = demoPassword;
  await ensureUser({ email: 'admin@demo-traders.test', name: 'Demo Admin', role: 'ADMIN', password: pw, companyId });
  await ensureUser({ email: 'hr@demo-traders.test', name: 'Demo HR', role: 'HR', password: pw, companyId });
  await ensureUser({ email: 'accounts@demo-traders.test', name: 'Demo Accountant', role: 'ACCOUNTANT', password: pw, companyId });
  await ensureUser({ email: 'manager@demo-traders.test', name: 'Meera Manager', role: 'MANAGER', password: pw, companyId, employeeId: mgr.id });
  await ensureUser({ email: 'ravi@demo-traders.test', name: 'Ravi Rep', role: 'MANAGER', password: pw, companyId, employeeId: rep.id });
  console.log(
    'Demo company ready: Demo Traders (logins @demo-traders.test, password from SEED_DEMO_PASSWORD or Demo-pass-2026; first sign-in asks to change it)',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
