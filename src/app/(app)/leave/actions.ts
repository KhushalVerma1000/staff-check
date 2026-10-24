'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan, can } from '@/lib/auth/can';
import { parseDay, toDayKey } from '@/lib/attendance/summary';
import { firstIssue, optional, text } from '@/lib/form';
import { leaveDays } from '@/lib/leave/days';
import { prisma } from '@/lib/prisma';
import { getActor } from '@/lib/session';
import { canSeeEmployee, companyIdOf } from '@/lib/tenant/scope';
import { todayKey } from '@/lib/tenant/time';

const requestSchema = z.object({
  type: z.enum(['CASUAL', 'SICK', 'PAID', 'UNPAID']),
  from: z.string().min(1, 'Choose the first day.'),
  to: z.string().min(1, 'Choose the last day.'),
  reason: z.string().max(500).optional(),
});

export async function requestLeaveAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'leave:request', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  if (!actor.employeeId) return fail('Your login is not linked to a staff record. Ask your admin to link it.');

  const parsed = requestSchema.safeParse({
    type: text(fd, 'type'),
    from: text(fd, 'from'),
    to: text(fd, 'to') || text(fd, 'from'),
    reason: optional(fd, 'reason'),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const from = parseDay(parsed.data.from);
  const to = parseDay(parsed.data.to);
  if (!from || !to) return fail('Enter valid dates.');
  if (to < from) return fail('The last day cannot be before the first day.');
  if ((to.getTime() - from.getTime()) / 86_400_000 > 90) return fail('A single request can cover at most 90 days.');

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  if (parsed.data.from < todayKey(company?.timezone ?? 'UTC') && parsed.data.type !== 'SICK') {
    return fail('Past-dated leave can only be requested as sick leave. Ask HR to record it otherwise.');
  }

  const halfDay = text(fd, 'halfDay') === 'on';
  const days = leaveDays(from, to, halfDay);
  if (days <= 0) return fail('That range has no working days (Sundays are off).');

  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: actor.employeeId,
      companyId,
      status: { in: ['PENDING', 'APPROVED'] },
      fromDate: { lte: to },
      toDate: { gte: from },
    },
    select: { id: true },
  });
  if (overlapping) return fail('You already have leave requested for some of those days.');

  const req = await prisma.leaveRequest.create({
    data: {
      companyId,
      employeeId: actor.employeeId,
      type: parsed.data.type,
      fromDate: from,
      toDate: to,
      days,
      reason: parsed.data.reason,
    },
  });
  await audit({
    companyId,
    userId: actor.id,
    action: 'leave.request',
    entity: 'LeaveRequest',
    entityId: req.id,
    detail: `${parsed.data.from} → ${parsed.data.to} (${days}d)`,
  });
  revalidatePath('/leave');
  revalidatePath('/dashboard');
  return done('Leave requested. Your manager has been asked to review it.');
}

export async function cancelLeaveAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'leave:request', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  if (!actor.employeeId) return;
  const id = text(formData, 'id');

  const req = await prisma.leaveRequest.findFirst({ where: { id, companyId, employeeId: actor.employeeId, status: 'PENDING' } });
  if (!req) return;
  await prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  await audit({ companyId, userId: actor.id, action: 'leave.cancel', entity: 'LeaveRequest', entityId: id });
  revalidatePath('/leave');
  revalidatePath('/dashboard');
}

export async function decideLeaveAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'leave:decide', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const id = text(formData, 'id');
  const decision = text(formData, 'decision');
  if (decision !== 'APPROVED' && decision !== 'REJECTED') return;

  const req = await prisma.leaveRequest.findFirst({
    where: { id, companyId, status: 'PENDING' },
    include: { employee: { select: { id: true, companyId: true, managerId: true } } },
  });
  if (!req) return;

  // Managers only decide for their own team; HR / admin for everyone.
  if (!canSeeEmployee(actor, req.employee)) return;
  // Nobody approves their own leave — except the admin, who may be the only approver in a small company.
  if (req.employeeId === actor.employeeId && actor.role !== 'ADMIN') return;
  // A manager never decides their own request even if they somehow match the scope rule.
  if (actor.role === 'MANAGER' && req.employeeId === actor.employeeId) return;
  if (!can(actor, 'leave:decide', { companyId: req.companyId })) return;

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: decision, decidedById: actor.id, decidedAt: new Date(), decisionNote: optional(formData, 'note') ?? null },
  });

  if (decision === 'APPROVED') {
    // Reflect approved leave on the attendance sheet. Existing PRESENT / HALF_DAY records are left alone.
    const status = req.type === 'UNPAID' ? 'ABSENT' : 'ON_LEAVE';
    const note = `${req.type.toLowerCase()} leave`;
    const days: Date[] = [];
    for (let d = new Date(req.fromDate); d <= req.toDate; d = new Date(d.getTime() + 86_400_000)) {
      if (d.getUTCDay() !== 0) days.push(new Date(toDayKey(d)));
    }
    const existing = await prisma.attendanceRecord.findMany({
      where: { employeeId: req.employeeId, date: { in: days } },
      select: { date: true, status: true },
    });
    const keep = new Set(existing.filter((r) => r.status === 'PRESENT' || r.status === 'HALF_DAY').map((r) => toDayKey(r.date)));
    await prisma.$transaction(
      days
        .filter((d) => !keep.has(toDayKey(d)))
        .map((d) =>
          prisma.attendanceRecord.upsert({
            where: { employeeId_date: { employeeId: req.employeeId, date: d } },
            create: { companyId, employeeId: req.employeeId, date: d, status, source: 'MANUAL', note, markedById: actor.id },
            update: { status, note, markedById: actor.id },
          }),
        ),
    );
  }

  await audit({
    companyId,
    userId: actor.id,
    action: decision === 'APPROVED' ? 'leave.approve' : 'leave.reject',
    entity: 'LeaveRequest',
    entityId: id,
  });
  revalidatePath('/leave');
  revalidatePath('/attendance');
  revalidatePath('/dashboard');
}
