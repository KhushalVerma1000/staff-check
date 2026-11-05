'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, emailTemplate } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { text } from '@/lib/form';
import { EMAIL_KINDS, templateProblems, type EmailKind } from '@/lib/mail/custom';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

/** Saves one email's wording. Both boxes blank puts the built-in wording back. */
export async function saveEmailTemplateAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'leavePolicy:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const kind = text(fd, 'kind');
  if (!(kind in EMAIL_KINDS)) return fail('Unknown email.');
  const k = kind as EmailKind;
  const subject = text(fd, 'subject');
  const body = typeof fd.get('body') === 'string' ? (fd.get('body') as string).replace(/\r\n/g, '\n').trim() : '';

  if (subject === '' && body === '') {
    await db.delete(emailTemplate).where(and(eq(emailTemplate.companyId, companyId), eq(emailTemplate.kind, k)));
    await audit({ companyId, userId: actor.id, action: 'email.template.reset', entity: 'EmailTemplate', entityId: k });
    revalidatePath('/leave/emails');
    return done('Back to the standard wording.');
  }

  const problems = templateProblems(k, { subject, body });
  if (problems.length) return fail(problems[0]);

  await db
    .insert(emailTemplate)
    .values({ companyId, kind: k, subject, body })
    .onConflictDoUpdate({ target: [emailTemplate.companyId, emailTemplate.kind], set: { subject, body } });
  await audit({ companyId, userId: actor.id, action: 'email.template.save', entity: 'EmailTemplate', entityId: k });
  revalidatePath('/leave/emails');
  return done('Email wording saved. It applies to emails sent from now on.');
}
