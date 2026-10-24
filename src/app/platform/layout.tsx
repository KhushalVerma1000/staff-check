import { AppShell } from '@/components/shell/app-shell';
import { requireSuperAdmin } from '@/lib/session';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  return (
    <AppShell
      brand="Staff Check"
      subtitle="Platform admin"
      nav={[
        { href: '/platform', label: 'Overview', exact: true },
        { href: '/platform/companies', label: 'Companies' },
        { href: '/platform/audit-log', label: 'Activity' },
      ]}
      userName={user.name}
      roleLabel="Super admin"
    >
      {children}
    </AppShell>
  );
}
