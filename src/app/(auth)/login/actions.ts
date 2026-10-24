'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { fail, type ActionResult } from '@/lib/action-result';

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return fail('Enter your email and password.');

  const from = String(formData.get('from') ?? '');
  // Only allow same-site relative redirects.
  const redirectTo = from.startsWith('/') && !from.startsWith('//') ? from : '/';

  try {
    await signIn('credentials', { email, password, redirectTo });
  } catch (e) {
    if (e instanceof AuthError) {
      // One message for every failure: unknown email, wrong password, removed login, suspended company.
      return fail('Wrong email or password, or this account is not active.');
    }
    throw e; // the redirect on success is thrown by signIn and must propagate
  }
  return { ok: true };
}
