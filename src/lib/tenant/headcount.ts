import { MAX_EMPLOYEES } from '@/lib/labels';
import { prisma } from '@/lib/prisma';

/** Effective cap: the company's own limit, never above the product-wide 100. */
export function effectiveLimit(employeeLimit: number): number {
  return Math.min(Math.max(employeeLimit, 0), MAX_EMPLOYEES);
}

export async function headcount(companyId: string): Promise<{ active: number; limit: number; room: number }> {
  const [company, active] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { employeeLimit: true } }),
    prisma.employee.count({ where: { companyId, status: 'ACTIVE' } }),
  ]);
  const limit = effectiveLimit(company?.employeeLimit ?? 0);
  return { active, limit, room: Math.max(0, limit - active) };
}

/** Next free "E-0001" style code for a company. */
export async function nextEmployeeCode(companyId: string): Promise<string> {
  const rows = await prisma.employee.findMany({ where: { companyId }, select: { code: true } });
  let max = 0;
  for (const r of rows) {
    const m = /^E-(\d+)$/.exec(r.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `E-${String(max + 1).padStart(4, '0')}`;
}
