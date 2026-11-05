'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { db, attendanceRecord, company as companyTable, employee, leaveRequest } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan, can } from '@/lib/auth/can';
import { parseDay, toDayKey } from '@/lib/attendance/summary';
import { firstIssue, optional, text } from '@/lib/form';
import { env } from '@/lib/env';
import { fits } from '@/lib/leave/balance';
import { leaveDays } from '@/lib/leave/days';
import { employeeBalances } from '@/lib/leave/queries';
import { templateFor } from '@/lib/mail/store';
import { leaveDecidedEmail, leaveRequestedEmail } from '@/lib/mail/templates';
import { approverUserIds, notify, userIdOfEmployee } from '@/lib/notify';
import { fmtDate, LEAVE_TYPE_LABEL } from '@/lib/labels';
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

  const [company] = await db.select({ timezone: companyTable.timezone }).from(companyTable).where(eq(companyTable.id, companyId)).limit(1);
  if (parsed.data.from < todayKey(company?.timezone ?? 'UTC') && parsed.data.type !== 'SICK') {
    return fail('Past-dated leave can only be requested as sick leave. Ask HR to record it otherwise.');
  }

  const halfDay = text(fd, 'halfDay') === 'on';
  const days = leaveDays(from, to, halfDay);
  if (days <= 0) return fail('That range has no working days (Sundays are off).');

  const [overlapping] = await db
    .select({ id: leaveRequest.id })
    .from(leaveRequest)
    .where(
      and(
        eq(leaveRequest.employeeId, actor.employeeId),
        eq(leaveRequest.companyId, companyId),
        inArray(leaveRequest.status, ['PENDING', 'APPROVED']),
        lte(leaveRequest.fromDate, to),
        gte(leaveRequest.toDate, from),
      ),
    )
    .limit(1);
  if (overlapping) return fail('You already have leave requested for some of those days.');

  const balances = await employeeBalances(companyId, actor.employeeId, from.getUTCFullYear());
  const bal = balances[parsed.data.type];
  if (!fits(bal, days)) {
    return fail(
      `You have ${bal.remaining} ${bal.remaining === 1 ? 'day' : 'days'} of ${LEAVE_TYPE_LABEL[parsed.data.type].toLowerCase()} leave left for ${from.getUTCFullYear()}, and this request needs ${days}. Choose another type or ask HR.`,
    );
  }

  const [req] = await db
    .insert(leaveRequest)
    .values({
      companyId,
      employeeId: actor.employeeId,
      type: parsed.data.type,
      fromDate: from,
      toDate: to,
      days,
      reason: parsed.data.reason,
    })
    .returning();
  await audit({
    companyId,
    userId: actor.id,
    action: 'leave.request',
    entity: 'LeaveRequest',
    entityId: req.id,
    detail: `${parsed.data.from} → ${parsed.data.to} (${days}d)`,
  });
  const [me] = await db.select({ name: employee.name, managerId: employee.managerId }).from(employee).where(eq(employee.id, actor.employeeId)).limit(1);
  const approvers = await approverUserIds(companyId, { employeeId: actor.employeeId, managerId: me?.managerId ?? null, userId: actor.id });
  const typeLabel = LEAVE_TYPE_LABEL[parsed.data.type];
  const requestedTpl = await templateFor(companyId, 'leave.requested');
  await notify({
    companyId,
    userIds: approvers,
    kind: 'leave.requested',
    title: `${me?.name ?? 'A colleague'} asked for ${typeLabel.toLowerCase()} leave`,
    body: `${fmtDate(from)}${from.getTime() === to.getTime() ? '' : ` – ${fmtDate(to)}`} · ${days} ${days === 1 ? 'day' : 'days'}`,
    href: '/leave',
    email: (r) =>
      leaveRequestedEmail(
        {
          to: r.email,
          name: r.name,
          employeeName: me?.name ?? 'A colleague',
          type: typeLabel,
          from: fmtDate(from),
          until: fmtDate(to),
          days,
          reason: parsed.data.reason,
          appUrl: env().BETTER_AUTH_URL,
        },
        requestedTpl,
      ),
  });
  revalidatePath('/leave');
  revalidatePath('/dashboard');
  revalidatePath('/notifications');
  return done(
    approvers.length > 0 ? 'Leave requested. Your approver has been told.' : 'Leave requested. It is waiting in the review queue.',
  );
}

export async function cancelLeaveAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'leave:request', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  if (!actor.employeeId) return;
  const id = text(formData, 'id');

  const [req] = await db
    .select({ id: leaveRequest.id })
    .from(leaveRequest)
    .where(
      and(
        eq(leaveRequest.id, id),
        eq(leaveRequest.companyId, companyId),
        eq(leaveRequest.employeeId, actor.employeeId),
        eq(leaveRequest.status, 'PENDING'),
      ),
    )
    .limit(1);
  if (!req) return;
  await db.update(leaveRequest).set({ status: 'CANCELLED' }).where(eq(leaveRequest.id, id));
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

  const [row] = await db
    .select({
      req: leaveRequest,
      emp: { id: employee.id, companyId: employee.companyId, managerId: employee.managerId },
    })
    .from(leaveRequest)
    .innerJoin(employee, eq(employee.id, leaveRequest.employeeId))
    .where(and(eq(leaveRequest.id, id), eq(leaveRequest.companyId, companyId), eq(leaveRequest.status, 'PENDING')))
    .limit(1);
  if (!row) return;
  const req = { ...row.req, employee: row.emp };

  // Managers only decide for their own team; HR / admin for everyone.
  if (!canSeeEmployee(actor, req.employee)) return;
  // Nobody approves their own leave — except the admin, who may be the only approver in a small company.
  if (req.employeeId === actor.employeeId && actor.role !== 'ADMIN') return;
  // A manager never decides their own request even if they somehow match the scope rule.
  if (actor.role === 'MANAGER' && req.employeeId === actor.employeeId) return;
  if (!can(actor, 'leave:decide', { companyId: req.companyId })) return;

  await db
    .update(leaveRequest)
    .set({ status: decision, decidedById: actor.id, decidedAt: new Date(), decisionNote: optional(formData, 'note') ?? null })
    .where(eq(leaveRequest.id, id));

  if (decision === 'APPROVED') {
    // Reflect approved leave on the attendance sheet. Existing PRESENT / HALF_DAY records are left alone.
    const status = req.type === 'UNPAID' ? 'ABSENT' : 'ON_LEAVE';
    const note = `${req.type.toLowerCase()} leave`;
    const days: Date[] = [];
    for (let d = new Date(req.fromDate); d <= req.toDate; d = new Date(d.getTime() + 86_400_000)) {
      if (d.getUTCDay() !== 0) days.push(new Date(toDayKey(d)));
    }
    const existing = days.length
      ? await db
          .select({ date: attendanceRecord.date, status: attendanceRecord.status })
          .from(attendanceRecord)
          .where(and(eq(attendanceRecord.employeeId, req.employeeId), inArray(attendanceRecord.date, days)))
      : [];
    const keep = new Set(existing.filter((r) => r.status === 'PRESENT' || r.status === 'HALF_DAY').map((r) => toDayKey(r.date)));
    await db.transaction(async (tx) => {
      for (const d of days.filter((d) => !keep.has(toDayKey(d)))) {
        await tx
          .insert(attendanceRecord)
          .values({ companyId, employeeId: req.employeeId, date: d, status, source: 'MANUAL', note, markedById: actor.id })
          .onConflictDoUpdate({
            target: [attendanceRecord.employeeId, attendanceRecord.date],
            set: { status, note, markedById: actor.id },
          });
      }
    });
  }

  await audit({
    companyId,
    userId: actor.id,
    action: decision === 'APPROVED' ? 'leave.approve' : 'leave.reject',
    entity: 'LeaveRequest',
    entityId: id,
  });
  const requesterLogin = await userIdOfEmployee(companyId, req.employeeId);
  if (requesterLogin) {
    const approved = decision === 'APPROVED';
    const note = optional(formData, 'note') ?? null;
    const typeLabel = LEAVE_TYPE_LABEL[req.type];
    const decidedTpl = await templateFor(companyId, 'leave.decided');
    await notify({
      companyId,
      userIds: [requesterLogin],
      kind: 'leave.decided',
      title: `Your ${typeLabel.toLowerCase()} leave was ${approved ? 'approved' : 'not approved'}`,
      body: `${fmtDate(req.fromDate)}${req.fromDate.getTime() === req.toDate.getTime() ? '' : ` – ${fmtDate(req.toDate)}`}${note ? ` · “${note}”` : ''}`,
      href: '/leave',
      email: (r) =>
        leaveDecidedEmail(
          { to: r.email, name: r.name, approved, type: typeLabel, from: fmtDate(req.fromDate), until: fmtDate(req.toDate), note, appUrl: env().BETTER_AUTH_URL },
          decidedTpl,
        ),
    });
  }
  revalidatePath('/notifications');
  revalidatePath('/leave');
  revalidatePath('/attendance');
  revalidatePath('/dashboard');
}
