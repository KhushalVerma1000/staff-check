'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, attendanceCorrection, attendanceRecord, company, employee } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { validateCorrection } from '@/lib/attendance/correction';
import { parseDay } from '@/lib/attendance/summary';
import { optional, text } from '@/lib/form';
import { getActor } from '@/lib/session';
import { companyIdOf, canSeeEmployee } from '@/lib/tenant/scope';
import { todayKey } from '@/lib/tenant/time';

const STATUS = z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE']);

/** An employee asks to fix one of their own days. */
export async function requestCorrectionAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'attendance:selfCheckIn', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  if (!actor.employeeId) return fail('Your login is not linked to a staff record. Ask your admin to link it.');

  const status = STATUS.safeParse(text(fd, 'status'));
  if (!status.success) return fail('Choose what the day should be.');
  const reason = text(fd, 'reason');
  if (reason.length < 5) return fail('Give a short reason so your approver understands.');
  if (reason.length > 300) return fail('Keep the reason under 300 characters.');

  const [co] = await db.select({ tz: company.timezone }).from(company).where(eq(company.id, companyId)).limit(1);
  const tz = co?.tz ?? 'UTC';
  const dayKey = text(fd, 'date');
  const v = validateCorrection({
    dayKey,
    todayKey: todayKey(tz),
    status: status.data,
    checkIn: optional(fd, 'checkIn'),
    checkOut: optional(fd, 'checkOut'),
    tz,
  });
  if (!v.ok) return fail(v.error);

  const [emp] = await db
    .select({ id: employee.id })
    .from(employee)
    .where(and(eq(employee.id, actor.employeeId), eq(employee.companyId, companyId), eq(employee.status, 'ACTIVE')))
    .limit(1);
  if (!emp) return fail('Your staff record is not active.');

  try {
    const [row] = await db
      .insert(attendanceCorrection)
      .values({
        companyId,
        employeeId: emp.id,
        date: parseDay(dayKey)!,
        requestedStatus: status.data,
        requestedCheckIn: v.checkIn,
        requestedCheckOut: v.checkOut,
        reason,
      })
      .returning({ id: attendanceCorrection.id });
    await audit({ companyId, userId: actor.id, action: 'attendance.correction.request', entity: 'AttendanceCorrection', entityId: row.id, detail: `${dayKey} → ${status.data}` });
  } catch {
    // The partial unique index allows one open request per person per day.
    return fail('You already have a pending request for that day.');
  }
  revalidatePath('/attendance/corrections');
  return done('Sent for approval.');
}

/** Withdraw your own pending request. */
export async function cancelCorrectionAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'attendance:selfCheckIn', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  if (!actor.employeeId) return;
  const id = text(formData, 'id');
  await db
    .update(attendanceCorrection)
    .set({ status: 'CANCELLED' })
    .where(
      and(
        eq(attendanceCorrection.id, id),
        eq(attendanceCorrection.companyId, companyId),
        eq(attendanceCorrection.employeeId, actor.employeeId),
        eq(attendanceCorrection.status, 'PENDING'),
      ),
    );
  revalidatePath('/attendance/corrections');
}

/** An approver (team manager, HR or admin) approves or rejects a request. */
export async function decideCorrectionAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'attendance:mark', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const id = text(formData, 'id');
  const decision = text(formData, 'decision');
  if (decision !== 'APPROVED' && decision !== 'REJECTED') return;

  const [row] = await db
    .select({
      req: attendanceCorrection,
      emp: { id: employee.id, companyId: employee.companyId, managerId: employee.managerId },
    })
    .from(attendanceCorrection)
    .innerJoin(employee, eq(employee.id, attendanceCorrection.employeeId))
    .where(and(eq(attendanceCorrection.id, id), eq(attendanceCorrection.companyId, companyId), eq(attendanceCorrection.status, 'PENDING')))
    .limit(1);
  if (!row) return;
  const { req, emp } = row;

  // Managers only decide for their own team; HR / admin for everyone.
  if (!canSeeEmployee(actor, emp)) return;
  // Nobody approves their own correction, except an admin who may be the only approver.
  if (req.employeeId === actor.employeeId && actor.role !== 'ADMIN') return;

  await db.transaction(async (tx) => {
    await tx
      .update(attendanceCorrection)
      .set({ status: decision, decidedById: actor.id, decidedAt: new Date(), decisionNote: optional(formData, 'note') ?? null })
      .where(eq(attendanceCorrection.id, id));
    if (decision === 'APPROVED') {
      const set = {
        status: req.requestedStatus,
        checkIn: req.requestedCheckIn,
        checkOut: req.requestedCheckOut,
        source: 'MANUAL' as const,
        note: `Corrected: ${req.reason}`.slice(0, 300),
        markedById: actor.id,
      };
      await tx
        .insert(attendanceRecord)
        .values({ companyId, employeeId: req.employeeId, date: req.date, ...set })
        .onConflictDoUpdate({ target: [attendanceRecord.employeeId, attendanceRecord.date], set });
    }
  });
  await audit({
    companyId,
    userId: actor.id,
    action: decision === 'APPROVED' ? 'attendance.correction.approve' : 'attendance.correction.reject',
    entity: 'AttendanceCorrection',
    entityId: id,
  });
  revalidatePath('/attendance/corrections');
  revalidatePath('/attendance');
  revalidatePath('/dashboard');
}
