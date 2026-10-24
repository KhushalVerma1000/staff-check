/**
 * Seed: the platform owner (always) and an optional demo company.
 *   SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD   required
 *   SEED_DEMO=1                                         also create "Demo Traders" with one login per role
 * Safe to re-run: existing rows are left alone (passwords are never overwritten).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function ensureUser(data: {
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'ACCOUNTANT' | 'MANAGER';
  password: string;
  companyId?: string;
  employeeId?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role,
      companyId: data.companyId ?? null,
      employeeId: data.employeeId ?? null,
      passwordHash: await bcrypt.hash(data.password, 12),
      mustChangePassword: data.role === 'SUPER_ADMIN' ? false : true,
    },
  });
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
  let company = await prisma.company.findUnique({ where: { slug: 'demo-traders' } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Demo Traders',
        slug: 'demo-traders',
        status: 'ACTIVE',
        plan: 'STARTER',
        employeeLimit: 25,
        branches: {
          create: [
            { name: 'Head office', type: 'OFFICE', city: 'Pune', isHeadOffice: true },
            { name: 'Field team', type: 'FIELD' },
          ],
        },
        departments: { create: [{ name: 'Accounts' }, { name: 'Sales' }, { name: 'Operations' }] },
      },
    });
  }
  const head = await prisma.branch.findFirstOrThrow({ where: { companyId: company.id, isHeadOffice: true } });
  const sales = await prisma.department.findFirstOrThrow({ where: { companyId: company.id, name: 'Sales' } });

  const mk = async (code: string, name: string, extra: { managerId?: string; designation?: string } = {}) =>
    (await prisma.employee.findUnique({ where: { companyId_code: { companyId: company!.id, code } } })) ??
    prisma.employee.create({
      data: { companyId: company!.id, code, name, branchId: head.id, departmentId: sales.id, joinedOn: new Date('2026-01-05'), ...extra },
    });

  const mgr = await mk('E-0001', 'Meera Manager', { designation: 'Sales Manager' });
  const rep = await mk('E-0002', 'Ravi Rep', { designation: 'Sales Executive', managerId: mgr.id });
  await mk('E-0003', 'Sana Sales', { designation: 'Sales Executive', managerId: mgr.id });

  await ensureUser({ email: 'admin@demo-traders.test', name: 'Demo Admin', role: 'ADMIN', password: demoPassword, companyId: company.id });
  await ensureUser({ email: 'hr@demo-traders.test', name: 'Demo HR', role: 'HR', password: demoPassword, companyId: company.id });
  await ensureUser({ email: 'accounts@demo-traders.test', name: 'Demo Accountant', role: 'ACCOUNTANT', password: demoPassword, companyId: company.id });
  await ensureUser({ email: 'manager@demo-traders.test', name: 'Meera Manager', role: 'MANAGER', password: demoPassword, companyId: company.id, employeeId: mgr.id });
  await ensureUser({ email: 'ravi@demo-traders.test', name: 'Ravi Rep', role: 'MANAGER', password: demoPassword, companyId: company.id, employeeId: rep.id });
  console.log('Demo company ready: Demo Traders (logins @demo-traders.test, password from SEED_DEMO_PASSWORD or Demo-pass-2026; first sign-in asks to change it)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
