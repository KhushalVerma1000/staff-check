'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { forgetLoginState } from '@/auth';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan, COMPANY_ROLES } from '@/lib/auth/can';
import { firstIssue, optional, text } from '@/lib/form';
import { generateTempPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

const createSchema = z.object({
  name: z.string().min(2, 'Enter the name.').max(100),
  email: z.string().email('Enter a valid email.'),
  role: z.enum(COMPANY_ROLES),
});

export async function createUserAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'user:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const parsed = createSchema.safeParse({
    name: text(fd, 'name'),
    email: text(fd, 'email').toLowerCase(),
    role: text(fd, 'role'),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const employeeId = optional(fd, 'employeeId');
  if (employeeId) {
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, companyId, status: 'ACTIVE', user: null },
      select: { id: true },
    });
    if (!emp) return fail('That person is not available to link (already has a login, or is inactive).');
  }

  const taken = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (taken) return fail('That email already has a login.');

  const temp = generateTempPassword();
  const user = await prisma.user.create({
    data: {
      ...parsed.data,
      companyId,
      employeeId: employeeId ?? null,
      passwordHash: await bcrypt.hash(temp, 12),
      mustChangePassword: true,
    },
  });
  await audit({ companyId, userId: actor.id, action: 'user.create', entity: 'User', entityId: user.id, detail: `${user.email} (${user.role})` });
  revalidatePath('/users');
  return done(`Login created for ${user.email}. One-time password: ${temp} — share it securely; it is shown only once.`);
}

export async function resetPasswordAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'user:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const id = text(fd, 'id');
  const user = await prisma.user.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!user) return fail('Login not found.');

  const temp = generateTempPassword();
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(temp, 12), mustChangePassword: true } });
  forgetLoginState(id);
  await audit({ companyId, userId: actor.id, action: 'user.resetPassword', entity: 'User', entityId: id, detail: user.email });
  return done(`New one-time password for ${user.email}: ${temp} — shown only once.`);
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'user:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const id = text(formData, 'id');
  const role = z.enum(COMPANY_ROLES).safeParse(text(formData, 'role'));
  if (!role.success || id === actor.id) return; // you cannot change your own role

  const user = await prisma.user.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!user || user.role === role.data) return;
  if (user.role === 'ADMIN' && (await lastAdmin(companyId))) return; // keep at least one admin

  await prisma.user.update({ where: { id }, data: { role: role.data } });
  forgetLoginState(id);
  await audit({ companyId, userId: actor.id, action: 'user.changeRole', entity: 'User', entityId: id, detail: `${user.email}: ${user.role} → ${role.data}` });
  revalidatePath('/users');
}

export async function removeUserAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'user:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const id = text(formData, 'id');
  if (id === actor.id) return; // you cannot remove yourself
  const user = await prisma.user.findFirst({ where: { id, companyId, deletedAt: null } });
  if (!user) return;
  if (user.role === 'ADMIN' && (await lastAdmin(companyId))) return;

  await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  forgetLoginState(id);
  await audit({ companyId, userId: actor.id, action: 'user.remove', entity: 'User', entityId: id, detail: user.email });
  revalidatePath('/users');
}

/** True when this is the company's only remaining admin login. */
async function lastAdmin(companyId: string): Promise<boolean> {
  const admins = await prisma.user.count({ where: { companyId, role: 'ADMIN', deletedAt: null } });
  return admins <= 1;
}
