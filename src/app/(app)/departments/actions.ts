'use server';

import { revalidatePath } from 'next/cache';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, department as deptTable, employee } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { firstIssue, text } from '@/lib/form';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

const schema = z.object({ name: z.string().min(2, 'Enter a name.').max(80) });

export async function createDepartmentAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'department:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const parsed = schema.safeParse({ name: text(fd, 'name') });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const [exists] = await db
    .select({ id: deptTable.id })
    .from(deptTable)
    .where(and(eq(deptTable.companyId, companyId), eq(deptTable.name, parsed.data.name)))
    .limit(1);
  if (exists) return fail('A department with that name already exists.');

  const [dept] = await db.insert(deptTable).values({ companyId, name: parsed.data.name }).returning();
  await audit({ companyId, userId: actor.id, action: 'department.create', entity: 'Department', entityId: dept.id, detail: dept.name });
  revalidatePath('/departments');
  return done(`Added ${dept.name}.`);
}

export async function deleteDepartmentAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'department:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  const id = text(formData, 'id');

  const [dept] = await db
    .select()
    .from(deptTable)
    .where(and(eq(deptTable.id, id), eq(deptTable.companyId, companyId)))
    .limit(1);
  if (!dept) return;
  const [{ n }] = await db.select({ n: count() }).from(employee).where(eq(employee.departmentId, id));
  // Only empty departments can be removed; people keep their history otherwise.
  if (n > 0) return;
  await db.delete(deptTable).where(and(eq(deptTable.id, id), eq(deptTable.companyId, companyId)));
  await audit({ companyId, userId: actor.id, action: 'department.delete', entity: 'Department', entityId: id, detail: dept.name });
  revalidatePath('/departments');
}
