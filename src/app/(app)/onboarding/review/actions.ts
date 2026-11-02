'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, employeeKyc } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { optional, text } from '@/lib/form';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

/** HR / admin approve a submission, or send it back with a note. */
export async function reviewAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'onboarding:review', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const id = text(fd, 'id');
  const decision = text(fd, 'decision');
  const note = optional(fd, 'note');
  if (decision !== 'APPROVED' && decision !== 'CHANGES_REQUESTED') return fail('Unknown decision.');
  if (decision === 'CHANGES_REQUESTED' && !note) return fail('Tell the employee what to fix.');

  const updated = await db
    .update(employeeKyc)
    .set({ status: decision, reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note ?? null })
    .where(and(eq(employeeKyc.id, id), eq(employeeKyc.companyId, companyId), eq(employeeKyc.status, 'SUBMITTED')))
    .returning({ id: employeeKyc.id });
  if (updated.length === 0) return fail('That submission is no longer waiting for review.');
  await audit({
    companyId,
    userId: actor.id,
    action: decision === 'APPROVED' ? 'onboarding.approve' : 'onboarding.requestChanges',
    entity: 'EmployeeKyc',
    entityId: id,
    detail: note ?? null,
  });
  revalidatePath('/onboarding/review');
  return done(decision === 'APPROVED' ? 'Approved.' : 'Sent back to the employee.');
}
