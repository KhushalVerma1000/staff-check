import type { Actor } from '@/lib/auth/can';

/** An id that matches no row — used to fail closed. */
const NO_MATCH = '__no_match__';

/** The company a company-bound actor belongs to. Throws for the super admin / unscoped users. */
export function companyIdOf(actor: Actor): string {
  if (!actor.companyId) throw new Error('This action needs a company login.');
  return actor.companyId;
}

/**
 * Prisma `where` fragment limiting Employee rows to what the actor may see.
 * ADMIN / HR / ACCOUNTANT see the whole company. A MANAGER sees themself and
 * their direct reports; a manager login with no linked staff record sees nothing.
 */
export function employeeScope(actor: Actor): { companyId: string; OR?: Array<{ id: string } | { managerId: string }> } {
  const companyId = companyIdOf(actor);
  if (actor.role === 'MANAGER') {
    const me = actor.employeeId ?? NO_MATCH;
    return { companyId, OR: [{ id: me }, { managerId: me }] };
  }
  return { companyId };
}

/** Same rule, as an employee-id predicate for already-loaded rows. */
export function canSeeEmployee(
  actor: Actor,
  employee: { id: string; companyId: string; managerId: string | null },
): boolean {
  if (!actor.companyId || employee.companyId !== actor.companyId) return false;
  if (actor.role !== 'MANAGER') return true;
  if (!actor.employeeId) return false;
  return employee.id === actor.employeeId || employee.managerId === actor.employeeId;
}
