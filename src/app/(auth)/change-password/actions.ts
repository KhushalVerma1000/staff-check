'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { db, user } from '@/db';
import { auth } from '@/lib/auth/server';
import { fail, type ActionResult } from '@/lib/action-result';
import { passwordProblem } from '@/lib/password';
import { getSessionUser } from '@/lib/session';

export async function changePasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) redirect('/login');

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  const problem = passwordProblem(next);
  if (problem) return fail(problem);
  if (next !== confirm) return fail('The two new passwords do not match.');
  if (next === current) return fail('Choose a password different from the current one.');

  try {
    // Also signs out every other device.
    await auth.api.changePassword({
      body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (e) {
    if (e instanceof APIError) return fail('Current password is incorrect.');
    throw e;
  }
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, me.id));

  // Sessions are read from the database, so the current one is already up to date.
  redirect('/');
}
