import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { can, type Action, type Actor } from '@/lib/auth/can';

/** The signed-in user as an Actor, or null. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  return { id: u.id, role: u.role, companyId: u.companyId, employeeId: u.employeeId };
}

/** Page guard: signed-in company user, optionally holding `action`. Redirects otherwise. */
export async function requireCompanyActor(action?: Action): Promise<Actor & { companyId: string; name: string }> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) redirect('/login');
  if (u.role === 'SUPER_ADMIN') redirect('/platform');
  if (!u.companyId) redirect('/login');
  const actor: Actor = { id: u.id, role: u.role, companyId: u.companyId, employeeId: u.employeeId };
  if (action && !can(actor, action, { companyId: u.companyId })) redirect('/dashboard');
  return { ...actor, companyId: u.companyId, name: u.name ?? u.email ?? 'User' };
}

/** Page guard for the platform area. */
export async function requireSuperAdmin(): Promise<Actor & { name: string }> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) redirect('/login');
  if (u.role !== 'SUPER_ADMIN') redirect('/dashboard');
  return {
    id: u.id,
    role: u.role,
    companyId: null,
    employeeId: null,
    name: u.name ?? u.email ?? 'Super admin',
  };
}
