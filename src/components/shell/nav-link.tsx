'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function NavLink({ href, label, exact = false, badge }: { href: string; label: string; exact?: boolean; badge?: number }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-blue-50 text-blue-800' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      {label}
      {badge ? (
        <span className="ml-2 rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-semibold text-white" aria-label={`${badge} unread`}>
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}
