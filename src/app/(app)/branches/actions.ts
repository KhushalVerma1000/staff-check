'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { firstIssue, optional, text } from '@/lib/form';
import { prisma } from '@/lib/prisma';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

const schema = z.object({
  name: z.string().min(2, 'Enter a name.').max(80),
  type: z.enum(['OFFICE', 'FIELD']),
  city: z.string().max(80).optional(),
  address: z.string().max(300).optional(),
});

export async function createBranchAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'branch:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const parsed = schema.safeParse({
    name: text(fd, 'name'),
    type: text(fd, 'type') || 'OFFICE',
    city: optional(fd, 'city'),
    address: optional(fd, 'address'),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const exists = await prisma.branch.findFirst({ where: { companyId, name: parsed.data.name }, select: { id: true } });
  if (exists) return fail('A branch with that name already exists.');

  const isFirst = (await prisma.branch.count({ where: { companyId } })) === 0;
  const branch = await prisma.branch.create({ data: { ...parsed.data, companyId, isHeadOffice: isFirst } });
  await audit({ companyId, userId: actor.id, action: 'branch.create', entity: 'Branch', entityId: branch.id, detail: branch.name });
  revalidatePath('/branches');
  return done(`Added ${branch.name}.`);
}

export async function toggleBranchAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'branch:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  const id = text(formData, 'id');

  const branch = await prisma.branch.findFirst({ where: { id, companyId } });
  if (!branch) return;
  await prisma.branch.update({ where: { id }, data: { active: !branch.active } });
  await audit({
    companyId,
    userId: actor.id,
    action: branch.active ? 'branch.deactivate' : 'branch.activate',
    entity: 'Branch',
    entityId: id,
    detail: branch.name,
  });
  revalidatePath('/branches');
}
