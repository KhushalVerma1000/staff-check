import { AppShell, type NavItem } from '@/components/shell/app-shell';
import { can } from '@/lib/auth/can';
import { ROLE_LABEL } from '@/lib/labels';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireCompanyActor();
  const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { name: true, status: true } });

  const nav: NavItem[] = [{ href: '/dashboard', label: 'Dashboard', exact: true }];
  if (can(actor, 'employee:view')) nav.push({ href: '/employees', label: actor.role === 'MANAGER' ? 'My team' : 'Employees' });
  if (can(actor, 'attendance:view')) nav.push({ href: '/attendance', label: 'Attendance' });
  if (can(actor, 'leave:view')) nav.push({ href: '/leave', label: 'Leave' });
  if (can(actor, 'branch:manage')) nav.push({ href: '/branches', label: 'Branches' });
  if (can(actor, 'department:manage')) nav.push({ href: '/departments', label: 'Departments' });
  if (can(actor, 'reports:view')) nav.push({ href: '/reports', label: 'Reports' });
  if (can(actor, 'user:manage')) nav.push({ href: '/users', label: 'Logins' });
  if (can(actor, 'auditLog:view')) nav.push({ href: '/audit-log', label: 'Audit log' });

  return (
    <AppShell
      brand={company?.name ?? 'Staff Check'}
      subtitle={company?.status === 'TRIAL' ? 'Trial' : undefined}
      nav={nav}
      userName={actor.name}
      roleLabel={ROLE_LABEL[actor.role]}
    >
      {children}
    </AppShell>
  );
}
