import { signOut } from '@/auth';
import { Button } from '@/components/ui/button';
import { NavLink } from './nav-link';

export interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

/** Sidebar on desktop, scrolling tab row on phones. */
export function AppShell({
  brand,
  subtitle,
  nav,
  userName,
  roleLabel,
  children,
}: {
  brand: string;
  subtitle?: string;
  nav: NavItem[];
  userName: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  async function logout() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="border-b bg-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:block md:px-5 md:py-5">
          <div>
            <p className="text-base font-semibold text-gray-900">{brand}</p>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          <form action={logout} className="md:hidden">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-2 md:flex-col md:overflow-visible md:pb-0">
          {nav.map((n) => (
            <NavLink key={n.href} {...n} />
          ))}
        </nav>
        <div className="hidden border-t p-4 md:absolute md:bottom-0 md:block md:w-60">
          <p className="truncate text-sm font-medium text-gray-900">{userName}</p>
          <p className="mb-3 text-xs text-gray-500">{roleLabel}</p>
          <div className="flex gap-2">
            <form action={logout}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
            <Button asChild variant="ghost" size="sm">
              <a href="/change-password">Password</a>
            </Button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
