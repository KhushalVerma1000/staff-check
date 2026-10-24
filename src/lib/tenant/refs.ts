import { prisma } from '@/lib/prisma';

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
    const b = await prisma.branch.findFirst({ where: { id: refs.branchId, companyId, active: true }, select: { id: true } });
    if (!b) return 'Choose a valid branch.';
  }
  if (refs.departmentId) {
    const d = await prisma.department.findFirst({ where: { id: refs.departmentId, companyId }, select: { id: true } });
    if (!d) return 'Choose a valid department.';
  }
  if (refs.managerId) {
    if (refs.selfId && refs.managerId === refs.selfId) return 'A person cannot be their own manager.';
    const m = await prisma.employee.findFirst({
      where: { id: refs.managerId, companyId, status: 'ACTIVE' },
      select: { id: true, managerId: true },
    });
    if (!m) return 'Choose a valid manager.';
    // Block simple reporting loops (A → B → A).
    if (refs.selfId && m.managerId === refs.selfId) return 'That would create a reporting loop.';
  }
  return null;
}
