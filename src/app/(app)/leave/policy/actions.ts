'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, leavePolicy } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { text } from '@/lib/form';
import { LEAVE_TYPES } from '@/lib/leave/balance';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

/** A blank box means unlimited; otherwise 0 to 366 days in half-day steps. */
const days = z
  .string()
  .transform((v) => (v === '' ? null : Number(v)))
  .pipe(z.number().min(0, 'Days cannot be negative.').max(366, 'A year has at most 366 days.').refine((n) => Number.isInteger(n * 2), 'Use whole or half days.').nullable());

export async function saveLeavePolicyAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'leavePolicy:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const values: Array<{ type: (typeof LEAVE_TYPES)[number]; annualDays: number | null }> = [];
  for (const type of LEAVE_TYPES) {
    const parsed = days.safeParse(text(fd, type));
    if (!parsed.success) return fail(`${type.charAt(0) + type.slice(1).toLowerCase()} leave: ${parsed.error.issues[0]?.message ?? 'enter a number of days.'}`);
    values.push({ type, annualDays: parsed.data });
  }

  await db.transaction(async (tx) => {
    for (const v of values) {
      await tx
        .insert(leavePolicy)
        .values({ companyId, type: v.type, annualDays: v.annualDays })
        .onConflictDoUpdate({ target: [leavePolicy.companyId, leavePolicy.type], set: { annualDays: v.annualDays } });
    }
  });
  await audit({
    companyId,
    userId: actor.id,
    action: 'leave.policy.save',
    entity: 'LeavePolicy',
    detail: values.map((v) => `${v.type}=${v.annualDays ?? 'unlimited'}`).join(', '),
  });
  revalidatePath('/leave');
  revalidatePath('/leave/policy');
  return done('Leave policy saved. It applies to new requests from now on.');
}
