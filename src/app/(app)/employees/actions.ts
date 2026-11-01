'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db, employee as employeeTable, user as userTable } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { revokeSessions } from '@/lib/auth/users';
import { parseDay } from '@/lib/attendance/summary';
import { firstIssue, optional, text } from '@/lib/form';
import { getActor } from '@/lib/session';
import { headcount, nextEmployeeCode } from '@/lib/tenant/headcount';
import { checkRefs } from '@/lib/tenant/refs';
import { companyIdOf } from '@/lib/tenant/scope';

const schema = z.object({
  name: z.string().min(2, 'Enter the full name.').max(100),
  code: z
    .string()
    .max(20)
    .regex(/^[A-Za-z0-9._-]*$/, 'Code may use letters, numbers, dot, dash and underscore only.')
    .optional(),
  email: z.string().email('Enter a valid email.').optional(),
  phone: z.string().max(20).optional(),
  designation: z.string().max(80).optional(),
  workType: z.enum(['OFFICE', 'FIELD', 'HYBRID']),
  branchId: z.string().optional(),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  joinedOn: z.string().min(1, 'Enter the joining date.'),
});

function readForm(fd: FormData) {
  return schema.safeParse({
    name: text(fd, 'name'),
    code: optional(fd, 'code'),
    email: optional(fd, 'email')?.toLowerCase(),
    phone: optional(fd, 'phone'),
    designation: optional(fd, 'designation'),
    workType: text(fd, 'workType') || 'OFFICE',
    branchId: optional(fd, 'branchId'),
    departmentId: optional(fd, 'departmentId'),
    managerId: optional(fd, 'managerId'),
    joinedOn: text(fd, 'joinedOn'),
  });
}

export async function createEmployeeAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'employee:create', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const parsed = readForm(fd);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = parsed.data;

  const joinedOn = parseDay(d.joinedOn);
  if (!joinedOn) return fail('Enter a valid joining date.');

  const { room, limit } = await headcount(companyId);
  if (room <= 0) return fail(`Your plan allows ${limit} active employees. Deactivate someone or ask your account manager to raise the limit.`);

  const refError = await checkRefs(companyId, d);
  if (refError) return fail(refError);

  const code = d.code || (await nextEmployeeCode(companyId));
  const [clash] = await db
    .select({ id: employeeTable.id })
    .from(employeeTable)
    .where(and(eq(employeeTable.companyId, companyId), eq(employeeTable.code, code)))
    .limit(1);
  if (clash) return fail(`Employee code ${code} is already used.`);

  const [emp] = await db
    .insert(employeeTable)
    .values({
      companyId,
      code,
      name: d.name,
      email: d.email,
      phone: d.phone,
      designation: d.designation,
      workType: d.workType,
      branchId: d.branchId,
      departmentId: d.departmentId,
      managerId: d.managerId,
      joinedOn,
    })
    .returning();
  await audit({ companyId, userId: actor.id, action: 'employee.create', entity: 'Employee', entityId: emp.id, detail: `${emp.code} ${emp.name}` });
  revalidatePath('/employees');
  redirect(`/employees/${emp.id}`);
}

export async function updateEmployeeAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'employee:edit', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  const id = text(fd, 'id');

  const [existing] = await db
    .select()
    .from(employeeTable)
    .where(and(eq(employeeTable.id, id), eq(employeeTable.companyId, companyId)))
    .limit(1);
  if (!existing) return fail('Employee not found.');

  const parsed = readForm(fd);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = parsed.data;

  const joinedOn = parseDay(d.joinedOn);
  if (!joinedOn) return fail('Enter a valid joining date.');

  const refError = await checkRefs(companyId, { ...d, selfId: id });
  if (refError) return fail(refError);

  const code = d.code || existing.code;
  if (code !== existing.code) {
    const [clash] = await db
      .select({ id: employeeTable.id })
      .from(employeeTable)
      .where(and(eq(employeeTable.companyId, companyId), eq(employeeTable.code, code), ne(employeeTable.id, id)))
      .limit(1);
    if (clash) return fail(`Employee code ${code} is already used.`);
  }

  await db
    .update(employeeTable)
    .set({
      code,
      name: d.name,
      email: d.email ?? null,
      phone: d.phone ?? null,
      designation: d.designation ?? null,
      workType: d.workType,
      branchId: d.branchId ?? null,
      departmentId: d.departmentId ?? null,
      managerId: d.managerId ?? null,
      joinedOn,
    })
    .where(and(eq(employeeTable.id, id), eq(employeeTable.companyId, companyId)));
  await audit({ companyId, userId: actor.id, action: 'employee.update', entity: 'Employee', entityId: id, detail: `${code} ${d.name}` });
  revalidatePath('/employees');
  revalidatePath(`/employees/${id}`);
  return done('Saved.');
}

export async function setEmployeeStatusAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'employee:deactivate', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  const id = text(formData, 'id');
  const target = text(formData, 'status');
  if (target !== 'ACTIVE' && target !== 'INACTIVE') return;

  const [emp] = await db
    .select()
    .from(employeeTable)
    .where(and(eq(employeeTable.id, id), eq(employeeTable.companyId, companyId)))
    .limit(1);
  if (!emp || emp.status === target) return;

  if (target === 'ACTIVE') {
    const { room } = await headcount(companyId);
    if (room <= 0) return; // the page explains the limit; never exceed it
  }

  await db
    .update(employeeTable)
    .set({
      status: target,
      exitedOn: target === 'INACTIVE' ? new Date(new Date().toISOString().slice(0, 10)) : null,
      // Staff who leave stop reporting into / managing others and lose their login.
      ...(target === 'INACTIVE' ? { managerId: null } : {}),
    })
    .where(and(eq(employeeTable.id, id), eq(employeeTable.companyId, companyId)));
  if (target === 'INACTIVE') {
    await db.update(employeeTable).set({ managerId: null }).where(and(eq(employeeTable.companyId, companyId), eq(employeeTable.managerId, id)));
    const removed = await db
      .update(userTable)
      .set({ deletedAt: new Date() })
      .where(and(eq(userTable.companyId, companyId), eq(userTable.employeeId, id), isNull(userTable.deletedAt)))
      .returning({ id: userTable.id });
    await Promise.all(removed.map((u) => revokeSessions(u.id)));
  }
  await audit({
    companyId,
    userId: actor.id,
    action: target === 'INACTIVE' ? 'employee.deactivate' : 'employee.reactivate',
    entity: 'Employee',
    entityId: id,
    detail: `${emp.code} ${emp.name}`,
  });
  revalidatePath('/employees');
  revalidatePath(`/employees/${id}`);
}
