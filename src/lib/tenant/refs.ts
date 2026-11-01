import { and, eq } from 'drizzle-orm';
import { db, branch, department, employee } from '@/db';

/**
 * A client-supplied branch / department / manager id must belong to the caller's
 * company — otherwise a crafted form post could link a record to another tenant.
 * Returns an error message, or null when every given id is valid.
 */
export async function checkRefs(
  companyId: string,
  refs: { branchId?: string | null; departmentId?: string | null; managerId?: string | null; selfId?: string },
): Promise<string | null> {
  if (refs.branchId) {
    const [b] = await db
      .select({ id: branch.id })
      .from(branch)
      .where(and(eq(branch.id, refs.branchId), eq(branch.companyId, companyId), eq(branch.active, true)))
      .limit(1);
    if (!b) return 'Choose a valid branch.';
  }
  if (refs.departmentId) {
    const [d] = await db
      .select({ id: department.id })
      .from(department)
      .where(and(eq(department.id, refs.departmentId), eq(department.companyId, companyId)))
      .limit(1);
    if (!d) return 'Choose a valid department.';
  }
  if (refs.managerId) {
    if (refs.selfId && refs.managerId === refs.selfId) return 'A person cannot be their own manager.';
    const [m] = await db
      .select({ id: employee.id, managerId: employee.managerId })
      .from(employee)
      .where(and(eq(employee.id, refs.managerId), eq(employee.companyId, companyId), eq(employee.status, 'ACTIVE')))
      .limit(1);
    if (!m) return 'Choose a valid manager.';
    // Block simple reporting loops (A → B → A).
    if (refs.selfId && m.managerId === refs.selfId) return 'That would create a reporting loop.';
  }
  return null;
}
