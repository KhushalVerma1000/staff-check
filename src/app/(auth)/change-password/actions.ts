'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { auth, forgetLoginState, signOut } from '@/auth';
import { prisma } from '@/lib/prisma';
import { fail, type ActionResult } from '@/lib/action-result';
import { passwordProblem } from '@/lib/password';

export async function changePasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  const problem = passwordProblem(next);
  if (problem) return fail(problem);
  if (next !== confirm) return fail('The two new passwords do not match.');
  if (next === current) return fail('Choose a password different from the current one.');

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) return fail('Current password is incorrect.');

  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false },
  });
  forgetLoginState(session.user.id);

  // The JWT still says mustChangePassword — sign out so the next sign-in picks up the new state.
  await signOut({ redirectTo: '/login' });
  return { ok: true };
}
