'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { parseDay } from '@/lib/attendance/summary';
import { text } from '@/lib/form';
import { prisma } from '@/lib/prisma';
import { getActor } from '@/lib/session';
import { companyIdOf, employeeScope } from '@/lib/tenant/scope';
import { todayKey } from '@/lib/tenant/time';

const STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE'] as const;

async function companyTz(companyId: string): Promise<string> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  return c?.timezone ?? 'UTC';
}

/** Mark a whole day for everyone the actor may see. Form fields: date, status_<employeeId>. */
export async function markAttendanceAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'attendance:mark', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const dayKey = text(fd, 'date');
  const day = parseDay(dayKey);
  if (!day) return fail('Pick a valid date.');
  if (dayKey > todayKey(await companyTz(companyId))) return fail('You cannot mark attendance for a future date.');

  const entries: Array<{ employeeId: string; status: (typeof STATUSES)[number] }> = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith('status_') || typeof value !== 'string' || value === '') continue;
    const status = z.enum(STATUSES).safeParse(value);
    if (!status.success) return fail('Unknown attendance status.');
    entries.push({ employeeId: key.slice('status_'.length), status: status.data });
  }
  if (entries.length === 0) return fail('Choose a status for at least one person.');

  // Only people this actor may see, in this company, still active.
  const allowed = await prisma.employee.findMany({
    where: { AND: [employeeScope(actor), { status: 'ACTIVE', id: { in: entries.map((e) => e.employeeId) } }] },
    select: { id: true },
  });
  const allowedIds = new Set(allowed.map((a) => a.id));
  const valid = entries.filter((e) => allowedIds.has(e.employeeId));
  if (valid.length !== entries.length) return fail('Some of those people are outside your team. Reload and try again.');

  await prisma.$transaction(
    valid.map((e) =>
      prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: e.employeeId, date: day } },
        create: { companyId, employeeId: e.employeeId, date: day, status: e.status, source: 'MANUAL', markedById: actor.id },
        update: { status: e.status, markedById: actor.id },
      }),
    ),
  );
  await audit({
    companyId,
    userId: actor.id,
    action: 'attendance.mark',
    entity: 'Attendance',
    detail: `${dayKey}: ${valid.length} people`,
  });
  revalidatePath('/attendance');
  revalidatePath('/dashboard');
  return done(`Saved attendance for ${valid.length} ${valid.length === 1 ? 'person' : 'people'}.`);
}

const geoSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

/** Self check-in / check-out for the signed-in person's own staff record. */
export async function selfCheckAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'attendance:selfCheckIn', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  if (!actor.employeeId) return fail('Your login is not linked to a staff record. Ask your admin to link it.');

  const emp = await prisma.employee.findFirst({
    where: { id: actor.employeeId, companyId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!emp) return fail('Your staff record is not active.');

  const geo = geoSchema.safeParse({ lat: text(fd, 'lat') || undefined, lng: text(fd, 'lng') || undefined });
  const hasGeo = geo.success && geo.data.lat !== undefined && geo.data.lng !== undefined;

  const day = parseDay(todayKey(await companyTz(companyId)))!;
  const now = new Date();
  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: emp.id, date: day } },
  });

  if (!existing || !existing.checkIn) {
    await prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: emp.id, date: day } },
      create: {
        companyId,
        employeeId: emp.id,
        date: day,
        status: 'PRESENT',
        checkIn: now,
        source: 'SELF',
        latitude: hasGeo ? geo.data!.lat : null,
        longitude: hasGeo ? geo.data!.lng : null,
      },
      update: {
        status: 'PRESENT',
        checkIn: now,
        source: 'SELF',
        latitude: hasGeo ? geo.data!.lat : null,
        longitude: hasGeo ? geo.data!.lng : null,
      },
    });
    revalidatePath('/dashboard');
    revalidatePath('/attendance');
    return done('Checked in.');
  }
  if (!existing.checkOut) {
    await prisma.attendanceRecord.update({ where: { id: existing.id }, data: { checkOut: now } });
    revalidatePath('/dashboard');
    return done('Checked out. Have a good evening.');
  }
  return fail('You have already checked in and out today.');
}
