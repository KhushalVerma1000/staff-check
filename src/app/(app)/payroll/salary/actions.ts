'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, employee, salaryStructure } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { text } from '@/lib/form';
import { formatINR, parseRupees } from '@/lib/payroll/money';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

const amount = (fd: FormData, key: string, label: string): number | string => {
  const raw = text(fd, key);
  if (raw === '') return 0;
  return parseRupees(raw) ?? `${label}: enter an amount like 12000 or 12000.50.`;
};

/** Set or change one person's monthly pay. Applies to payroll runs created or recalculated after this. */
export async function saveSalaryAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'payroll:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const basic = amount(fd, 'basic', 'Basic');
  const hra = amount(fd, 'hra', 'HRA');
  const other = amount(fd, 'other', 'Other allowances');
  for (const v of [basic, hra, other]) if (typeof v === 'string') return fail(v);
  if ((basic as number) + (hra as number) + (other as number) <= 0) return fail('Enter at least one amount above zero.');

  // The employee id comes from the form, so it must be proven to belong to the caller's company.
  const [emp] = await db.select({ id: employee.id, name: employee.name }).from(employee).where(and(eq(employee.id, text(fd, 'employeeId')), eq(employee.companyId, companyId))).limit(1);
  if (!emp) return fail('That employee was not found.');

  const values = { basicPaise: basic as number, hraPaise: hra as number, otherPaise: other as number, updatedById: actor.id };
  await db
    .insert(salaryStructure)
    .values({ companyId, employeeId: emp.id, ...values })
    .onConflictDoUpdate({ target: salaryStructure.employeeId, set: values });
  await audit({
    companyId,
    userId: actor.id,
    action: 'salary.save',
    entity: 'SalaryStructure',
    entityId: emp.id,
    detail: `${emp.name}: ${formatINR((basic as number) + (hra as number) + (other as number))}/month`,
  });
  revalidatePath('/payroll/salary');
  return done('Saved.');
}
