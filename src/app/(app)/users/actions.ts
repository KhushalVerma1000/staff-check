'use server';

import { revalidatePath } from 'next/cache';
import { and, count, eq, isNull, notExists } from 'drizzle-orm';
import { z } from 'zod';
import { db, company as companyTable, employee, user as userTable } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan, COMPANY_ROLES } from '@/lib/auth/can';
import { createLogin, resetLoginPassword, revokeSessions } from '@/lib/auth/users';
import { firstIssue, optional, text } from '@/lib/form';
import { env } from '@/lib/env';
import { sendMail } from '@/lib/mail';
import { loginEmail } from '@/lib/mail/templates';
import { generateTempPassword } from '@/lib/password';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

/** Email the one-time password when the form's "Email the login details" box is ticked. Never throws. */
async function maybeEmailLogin(fd: FormData, companyId: string, p: { to: string; name: string; tempPassword: string; reset?: boolean }): Promise<string> {
  if (fd.get('sendEmail') !== 'on') return '';
  const [co] = await db.select({ name: companyTable.name }).from(companyTable).where(eq(companyTable.id, companyId)).limit(1);
  const res = await sendMail(loginEmail({ ...p, companyName: co?.name ?? 'your company', appUrl: env().BETTER_AUTH_URL }));
  return res.ok ? ` Login details emailed to ${p.to}.` : ` Could not email the details (${res.error}) — share the password another way.`;
}

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
    const [emp] = await db
      .select({ id: employee.id })
      .from(employee)
      .where(
        and(
          eq(employee.id, employeeId),
          eq(employee.companyId, companyId),
          eq(employee.status, 'ACTIVE'),
          notExists(db.select({ x: userTable.id }).from(userTable).where(eq(userTable.employeeId, employee.id))),
        ),
      )
      .limit(1);
    if (!emp) return fail('That person is not available to link (already has a login, or is inactive).');
  }

  const [taken] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, parsed.data.email)).limit(1);
  if (taken) return fail('That email already has a login.');

  const temp = generateTempPassword();
  const user = await createLogin({
    ...parsed.data,
    companyId,
    employeeId: employeeId ?? null,
    password: temp,
    mustChangePassword: true,
  });
  await audit({ companyId, userId: actor.id, action: 'user.create', entity: 'User', entityId: user.id, detail: `${user.email} (${user.role})` });
  const emailed = await maybeEmailLogin(fd, companyId, { to: user.email, name: user.name, tempPassword: temp });
  revalidatePath('/users');
  return done(`Login created for ${user.email}. One-time password: ${temp} — shown only once.${emailed}`);
}

export async function resetPasswordAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'user:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const id = text(fd, 'id');
  const [user] = await db
    .select()
    .from(userTable)
    .where(and(eq(userTable.id, id), eq(userTable.companyId, companyId), isNull(userTable.deletedAt)))
    .limit(1);
  if (!user) return fail('Login not found.');

  const temp = generateTempPassword();
  await resetLoginPassword(id, temp, true);
  await audit({ companyId, userId: actor.id, action: 'user.resetPassword', entity: 'User', entityId: id, detail: user.email });
  const emailed = await maybeEmailLogin(fd, companyId, { to: user.email, name: user.name, tempPassword: temp, reset: true });
  return done(`New one-time password for ${user.email}: ${temp} — shown only once.${emailed}`);
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'user:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const id = text(formData, 'id');
  const role = z.enum(COMPANY_ROLES).safeParse(text(formData, 'role'));
  if (!role.success || id === actor.id) return; // you cannot change your own role

  const [user] = await db
    .select()
    .from(userTable)
    .where(and(eq(userTable.id, id), eq(userTable.companyId, companyId), isNull(userTable.deletedAt)))
    .limit(1);
  if (!user || user.role === role.data) return;
  if (user.role === 'ADMIN' && (await lastAdmin(companyId))) return; // keep at least one admin

  await db.update(userTable).set({ role: role.data }).where(eq(userTable.id, id));
  await audit({ companyId, userId: actor.id, action: 'user.changeRole', entity: 'User', entityId: id, detail: `${user.email}: ${user.role} → ${role.data}` });
  revalidatePath('/users');
}

export async function removeUserAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'user:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const id = text(formData, 'id');
  if (id === actor.id) return; // you cannot remove yourself
  const [user] = await db
    .select()
    .from(userTable)
    .where(and(eq(userTable.id, id), eq(userTable.companyId, companyId), isNull(userTable.deletedAt)))
    .limit(1);
  if (!user) return;
  if (user.role === 'ADMIN' && (await lastAdmin(companyId))) return;

  await db.update(userTable).set({ deletedAt: new Date() }).where(eq(userTable.id, id));
  await revokeSessions(id);
  await audit({ companyId, userId: actor.id, action: 'user.remove', entity: 'User', entityId: id, detail: user.email });
  revalidatePath('/users');
}

/** True when this is the company's only remaining admin login. */
async function lastAdmin(companyId: string): Promise<boolean> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(userTable)
    .where(and(eq(userTable.companyId, companyId), eq(userTable.role, 'ADMIN'), isNull(userTable.deletedAt)));
  return n <= 1;
}
