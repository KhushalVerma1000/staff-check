'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { firstIssue, text } from '@/lib/form';
import { prisma } from '@/lib/prisma';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

const schema = z.object({ name: z.string().min(2, 'Enter a name.').max(80) });

export async function createDepartmentAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'department:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const parsed = schema.safeParse({ name: text(fd, 'name') });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const exists = await prisma.department.findFirst({ where: { companyId, name: parsed.data.name }, select: { id: true } });
  if (exists) return fail('A department with that name already exists.');

  const dept = await prisma.department.create({ data: { companyId, name: parsed.data.name } });
  await audit({ companyId, userId: actor.id, action: 'department.create', entity: 'Department', entityId: dept.id, detail: dept.name });
  revalidatePath('/departments');
  return done(`Added ${dept.name}.`);
}

export async function deleteDepartmentAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'department:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  const id = text(formData, 'id');

  const dept = await prisma.department.findFirst({
    where: { id, companyId },
    include: { _count: { select: { employees: true } } },
  });
  // Only empty departments can be removed; people keep their history otherwise.
  if (!dept || dept._count.employees > 0) return;
  await prisma.department.delete({ where: { id } });
  await audit({ companyId, userId: actor.id, action: 'department.delete', entity: 'Department', entityId: id, detail: dept.name });
  revalidatePath('/departments');
}
