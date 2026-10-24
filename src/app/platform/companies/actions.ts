'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { firstIssue, optional, text } from '@/lib/form';
import { MAX_EMPLOYEES, PLAN_LIMITS } from '@/lib/labels';
import { generateTempPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma';
import { getActor } from '@/lib/session';
import { slugify } from '@/lib/slug';

const createSchema = z.object({
  name: z.string().min(2, 'Enter the company name.').max(100),
  plan: z.enum(['STARTER', 'GROWTH', 'BUSINESS']),
  employeeLimit: z.coerce.number().int().min(1, 'Seat limit must be at least 1.').max(MAX_EMPLOYEES, `The product is for teams up to ${MAX_EMPLOYEES}.`),
  timezone: z.string().min(1),
  trialDays: z.coerce.number().int().min(0).max(90),
  contactName: z.string().max(100).optional(),
  contactEmail: z.string().email('Enter a valid contact email.').optional(),
  contactPhone: z.string().max(20).optional(),
  adminName: z.string().min(2, 'Enter the admin’s name.').max(100),
  adminEmail: z.string().email('Enter a valid admin email.'),
});

export async function createCompanyAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'platform:manage');

  const plan = text(fd, 'plan') || 'STARTER';
  const parsed = createSchema.safeParse({
    name: text(fd, 'name'),
    plan,
    employeeLimit: text(fd, 'employeeLimit') || PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || 25,
    timezone: text(fd, 'timezone') || 'Asia/Kolkata',
    trialDays: text(fd, 'trialDays') || 0,
    contactName: optional(fd, 'contactName'),
    contactEmail: optional(fd, 'contactEmail')?.toLowerCase(),
    contactPhone: optional(fd, 'contactPhone'),
    adminName: text(fd, 'adminName'),
    adminEmail: text(fd, 'adminEmail').toLowerCase(),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = parsed.data;

  try {
    Intl.DateTimeFormat('en', { timeZone: d.timezone });
  } catch {
    return fail('Unknown timezone. Use an IANA name such as Asia/Kolkata.');
  }

  if (await prisma.user.findUnique({ where: { email: d.adminEmail }, select: { id: true } })) {
    return fail('That admin email already has a login.');
  }

  // Unique slug: acme, acme-2, acme-3…
  const base = slugify(d.name);
  let slug = base;
  for (let n = 2; await prisma.company.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`;

  const temp = generateTempPassword();
  const passwordHash = await bcrypt.hash(temp, 12);
  const trialEndsAt = d.trialDays > 0 ? new Date(Date.now() + d.trialDays * 86_400_000) : null;

  const company = await prisma.company.create({
    data: {
      name: d.name,
      slug,
      plan: d.plan,
      employeeLimit: d.employeeLimit,
      timezone: d.timezone,
      status: trialEndsAt ? 'TRIAL' : 'ACTIVE',
      trialEndsAt,
      contactName: d.contactName,
      contactEmail: d.contactEmail,
      contactPhone: d.contactPhone,
      branches: { create: { name: 'Head office', type: 'OFFICE', isHeadOffice: true } },
      users: {
        create: { name: d.adminName, email: d.adminEmail, role: 'ADMIN', passwordHash, mustChangePassword: true },
      },
    },
  });
  await audit({ companyId: null, userId: actor.id, action: 'company.create', entity: 'Company', entityId: company.id, detail: `${company.name} (${slug})` });

  revalidatePath('/platform/companies');
  revalidatePath('/platform');
  // Shown once, inline — never put a password in a URL (history, logs, Referer).
  return done(
    `Created ${company.name}. Admin login: ${d.adminEmail} · one-time password: ${temp} — share it securely; it is shown only once.`,
  );
}

const updateSchema = z.object({
  plan: z.enum(['STARTER', 'GROWTH', 'BUSINESS']),
  employeeLimit: z.coerce.number().int().min(1).max(MAX_EMPLOYEES),
  name: z.string().min(2).max(100),
  contactName: z.string().max(100).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(20).optional(),
});

export async function updateCompanyAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'platform:manage');
  const id = text(fd, 'id');

  const parsed = updateSchema.safeParse({
    plan: text(fd, 'plan'),
    employeeLimit: text(fd, 'employeeLimit'),
    name: text(fd, 'name'),
    contactName: optional(fd, 'contactName'),
    contactEmail: optional(fd, 'contactEmail')?.toLowerCase(),
    contactPhone: optional(fd, 'contactPhone'),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const company = await prisma.company.findUnique({ where: { id }, select: { id: true } });
  if (!company) return fail('Company not found.');

  const active = await prisma.employee.count({ where: { companyId: id, status: 'ACTIVE' } });
  if (parsed.data.employeeLimit < active) {
    return fail(`They already have ${active} active employees. Set the limit to ${active} or more.`);
  }

  await prisma.company.update({
    where: { id },
    data: {
      ...parsed.data,
      contactName: parsed.data.contactName ?? null,
      contactEmail: parsed.data.contactEmail ?? null,
      contactPhone: parsed.data.contactPhone ?? null,
    },
  });
  await audit({
    companyId: null,
    userId: actor.id,
    action: 'company.update',
    entity: 'Company',
    entityId: id,
    detail: `${parsed.data.name}: ${parsed.data.plan}, ${parsed.data.employeeLimit} seats`,
  });
  revalidatePath(`/platform/companies/${id}`);
  revalidatePath('/platform/companies');
  return done('Saved.');
}

export async function setCompanyStatusAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'platform:manage');
  const id = text(fd, 'id');
  const target = text(fd, 'status');
  if (target !== 'SUSPENDED' && target !== 'ACTIVE') return fail('Unknown status.');

  const company = await prisma.company.findUnique({ where: { id }, select: { name: true } });
  if (!company) return fail('Company not found.');

  await prisma.company.update({
    where: { id },
    data:
      target === 'SUSPENDED'
        ? { status: 'SUSPENDED', suspendedAt: new Date(), suspendReason: optional(fd, 'reason') ?? null }
        : { status: 'ACTIVE', suspendedAt: null, suspendReason: null },
  });
  await audit({
    companyId: null,
    userId: actor.id,
    action: target === 'SUSPENDED' ? 'company.suspend' : 'company.reactivate',
    entity: 'Company',
    entityId: id,
    detail: company.name,
  });
  revalidatePath(`/platform/companies/${id}`);
  revalidatePath('/platform/companies');
  return done(target === 'SUSPENDED' ? 'Suspended. Their users are signed out within a minute.' : 'Reactivated.');
}

export async function resetCompanyAdminAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'platform:manage');
  const userId = text(fd, 'userId');
  const companyId = text(fd, 'companyId');

  const user = await prisma.user.findFirst({ where: { id: userId, companyId, role: 'ADMIN', deletedAt: null } });
  if (!user) return fail('Admin login not found.');

  const temp = generateTempPassword();
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(temp, 12), mustChangePassword: true } });
  await audit({ companyId: null, userId: actor.id, action: 'company.resetAdminPassword', entity: 'User', entityId: userId, detail: user.email });
  return done(`New one-time password for ${user.email}: ${temp} — shown only once.`);
}
