import { eq } from 'drizzle-orm';
import { db, company } from '@/db';
import { AppShell, type NavItem } from '@/components/shell/app-shell';
import { can } from '@/lib/auth/can';
import { ROLE_LABEL } from '@/lib/labels';
import { requireCompanyActor } from '@/lib/session';

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireCompanyActor();
  const [co] = await db.select({ name: company.name, status: company.status }).from(company).where(eq(company.id, actor.companyId)).limit(1);

  const nav: NavItem[] = [{ href: '/dashboard', label: 'Dashboard', exact: true }];
  if (can(actor, 'employee:view')) nav.push({ href: '/employees', label: actor.role === 'MANAGER' ? 'My team' : 'Employees' });
  if (can(actor, 'attendance:view')) nav.push({ href: '/attendance', label: 'Attendance' });
  if (can(actor, 'leave:view')) nav.push({ href: '/leave', label: 'Leave' });
  if (can(actor, 'branch:manage')) nav.push({ href: '/branches', label: 'Branches' });
  if (can(actor, 'department:manage')) nav.push({ href: '/departments', label: 'Departments' });
  if (can(actor, 'reports:view')) nav.push({ href: '/reports', label: 'Reports' });
  if (can(actor, 'onboarding:self') && actor.employeeId) nav.push({ href: '/onboarding', label: 'My onboarding' });
  if (can(actor, 'onboarding:review')) nav.push({ href: '/onboarding/review', label: 'Onboarding review' });
  if (can(actor, 'user:manage')) nav.push({ href: '/users', label: 'Logins' });
  if (can(actor, 'auditLog:view')) nav.push({ href: '/audit-log', label: 'Audit log' });

  return (
    <AppShell
      brand={co?.name ?? 'Staff Check'}
      subtitle={co?.status === 'TRIAL' ? 'Trial' : undefined}
      nav={nav}
      userName={actor.name}
      roleLabel={ROLE_LABEL[actor.role]}
    >
      {children}
    </AppShell>
  );
}
