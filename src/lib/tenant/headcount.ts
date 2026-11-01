import { and, count, eq } from 'drizzle-orm';
import { db, company, employee } from '@/db';
import { MAX_EMPLOYEES } from '@/lib/labels';

/** Effective cap: the company's own limit, never above the product-wide 100. */
export function effectiveLimit(employeeLimit: number): number {
  return Math.min(Math.max(employeeLimit, 0), MAX_EMPLOYEES);
}

export async function headcount(companyId: string): Promise<{ active: number; limit: number; room: number }> {
  const [[c], [n]] = await Promise.all([
    db.select({ employeeLimit: company.employeeLimit }).from(company).where(eq(company.id, companyId)).limit(1),
    db.select({ n: count() }).from(employee).where(and(eq(employee.companyId, companyId), eq(employee.status, 'ACTIVE'))),
  ]);
  const active = n?.n ?? 0;
  const limit = effectiveLimit(c?.employeeLimit ?? 0);
  return { active, limit, room: Math.max(0, limit - active) };
}

/** Next free "E-0001" style code for a company. */
export async function nextEmployeeCode(companyId: string): Promise<string> {
  const rows = await db.select({ code: employee.code }).from(employee).where(eq(employee.companyId, companyId));
  let max = 0;
  for (const r of rows) {
    const m = /^E-(\d+)$/.exec(r.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `E-${String(max + 1).padStart(4, '0')}`;
}
