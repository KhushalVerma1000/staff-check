'use server';

import { revalidatePath } from 'next/cache';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, branch as branchTable } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { firstIssue, optional, text } from '@/lib/form';
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

  const [exists] = await db
    .select({ id: branchTable.id })
    .from(branchTable)
    .where(and(eq(branchTable.companyId, companyId), eq(branchTable.name, parsed.data.name)))
    .limit(1);
  if (exists) return fail('A branch with that name already exists.');

  const [{ n }] = await db.select({ n: count() }).from(branchTable).where(eq(branchTable.companyId, companyId));
  const [branch] = await db
    .insert(branchTable)
    .values({ ...parsed.data, companyId, isHeadOffice: n === 0 })
    .returning();
  await audit({ companyId, userId: actor.id, action: 'branch.create', entity: 'Branch', entityId: branch.id, detail: branch.name });
  revalidatePath('/branches');
  return done(`Added ${branch.name}.`);
}

export async function toggleBranchAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'branch:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  const id = text(formData, 'id');

  const [branch] = await db
    .select()
    .from(branchTable)
    .where(and(eq(branchTable.id, id), eq(branchTable.companyId, companyId)))
    .limit(1);
  if (!branch) return;
  await db
    .update(branchTable)
    .set({ active: !branch.active })
    .where(and(eq(branchTable.id, id), eq(branchTable.companyId, companyId)));
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
