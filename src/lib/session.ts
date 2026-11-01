import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, company, user, type Role } from '@/db';
import { auth } from '@/lib/auth/server';
import { can, type Action, type Actor } from '@/lib/auth/can';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Null only for SUPER_ADMIN. */
  companyId: string | null;
  employeeId: string | null;
  mustChangePassword: boolean;
}

/**
 * The signed-in user, re-read from the database on every request (once per
 * request via React cache), so a role change, removal or suspension applies
 * immediately. Null when signed out, removed, or the company is suspended.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s?.session) return null;
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      employeeId: user.employeeId,
      mustChangePassword: user.mustChangePassword,
      deletedAt: user.deletedAt,
      companyStatus: company.status,
    })
    .from(user)
    .leftJoin(company, eq(company.id, user.companyId))
    .where(eq(user.id, s.user.id))
    .limit(1);
  if (!row || row.deletedAt || row.companyStatus === 'SUSPENDED') return null;
  const { deletedAt: _d, companyStatus: _c, ...u } = row;
  return u;
});

const toActor = (u: SessionUser): Actor => ({ id: u.id, role: u.role, companyId: u.companyId, employeeId: u.employeeId });

/**
 * The signed-in user as an Actor, or null. A login still on its one-time password
 * gets no actor, so server actions and route handlers refuse it until it is changed.
 */
export async function getActor(): Promise<Actor | null> {
  const u = await getSessionUser();
  return u && !u.mustChangePassword ? toActor(u) : null;
}

/** Page guard: signed-in company user, optionally holding `action`. Redirects otherwise. */
export async function requireCompanyActor(action?: Action): Promise<Actor & { companyId: string; name: string }> {
  const u = await getSessionUser();
  if (!u) redirect('/login');
  if (u.mustChangePassword) redirect('/change-password');
  if (u.role === 'SUPER_ADMIN') redirect('/platform');
  if (!u.companyId) redirect('/login');
  const actor = toActor(u);
  if (action && !can(actor, action, { companyId: u.companyId })) redirect('/dashboard');
  return { ...actor, companyId: u.companyId, name: u.name ?? u.email };
}

/** Page guard for the platform area. */
export async function requireSuperAdmin(): Promise<Actor & { name: string }> {
  const u = await getSessionUser();
  if (!u) redirect('/login');
  if (u.mustChangePassword) redirect('/change-password');
  if (u.role !== 'SUPER_ADMIN') redirect('/dashboard');
  return { ...toActor(u), companyId: null, employeeId: null, name: u.name ?? u.email };
}
