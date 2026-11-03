'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, attendanceRecord, branch, company, employee, punchEvent } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { evaluatePunch, refusalMessage } from '@/lib/attendance/punch';
import { parseDay } from '@/lib/attendance/summary';
import { text } from '@/lib/form';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';
import { employeeFilter } from '@/lib/tenant/sql';
import { todayKey } from '@/lib/tenant/time';

const STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE'] as const;

async function companyTz(companyId: string): Promise<string> {
  const [c] = await db.select({ timezone: company.timezone }).from(company).where(eq(company.id, companyId)).limit(1);
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
  const allowed = await db
    .select({ id: employee.id })
    .from(employee)
    .where(and(employeeFilter(actor), eq(employee.status, 'ACTIVE'), inArray(employee.id, entries.map((e) => e.employeeId))));
  const allowedIds = new Set(allowed.map((a) => a.id));
  const valid = entries.filter((e) => allowedIds.has(e.employeeId));
  if (valid.length !== entries.length) return fail('Some of those people are outside your team. Reload and try again.');

  await db.transaction(async (tx) => {
    for (const e of valid) {
      await tx
        .insert(attendanceRecord)
        .values({ companyId, employeeId: e.employeeId, date: day, status: e.status, source: 'MANUAL', markedById: actor.id })
        .onConflictDoUpdate({
          target: [attendanceRecord.employeeId, attendanceRecord.date],
          set: { status: e.status, markedById: actor.id },
        });
    }
  });
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
  acc: z.coerce.number().min(0).max(100000).optional(),
});

/** Self check-in / check-out for the signed-in person's own staff record. */
export async function selfCheckAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'attendance:selfCheckIn', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  if (!actor.employeeId) return fail('Your login is not linked to a staff record. Ask your admin to link it.');

  const [emp] = await db
    .select({
      id: employee.id,
      branchId: employee.branchId,
      branchName: branch.name,
      lat: branch.latitude,
      lng: branch.longitude,
      radiusM: branch.radiusM,
    })
    .from(employee)
    .leftJoin(branch, eq(branch.id, employee.branchId))
    .where(and(eq(employee.id, actor.employeeId), eq(employee.companyId, companyId), eq(employee.status, 'ACTIVE')))
    .limit(1);
  if (!emp) return fail('Your staff record is not active.');

  const geo = geoSchema.safeParse({
    lat: text(fd, 'lat') || undefined,
    lng: text(fd, 'lng') || undefined,
    acc: text(fd, 'acc') || undefined,
  });
  const hasGeo = geo.success && geo.data.lat !== undefined && geo.data.lng !== undefined;
  const position = hasGeo ? { lat: geo.data!.lat!, lng: geo.data!.lng! } : null;

  const fence = emp.lat !== null && emp.lng !== null && emp.radiusM !== null ? { lat: emp.lat, lng: emp.lng, radiusM: emp.radiusM } : null;
  const decision = evaluatePunch({ fence, position, accuracyM: geo.success ? geo.data.acc : undefined });

  const day = parseDay(todayKey(await companyTz(companyId)))!;
  const now = new Date();
  const record = (kind: 'IN' | 'OUT') =>
    db.insert(punchEvent).values({
      companyId,
      employeeId: emp.id,
      branchId: emp.branchId,
      ts: now,
      kind,
      outcome: decision.outcome,
      latitude: position?.lat ?? null,
      longitude: position?.lng ?? null,
      accuracyM: geo.success ? (geo.data.acc ?? null) : null,
      distanceM: decision.distanceM,
    });
  const [existing] = await db
    .select()
    .from(attendanceRecord)
    .where(and(eq(attendanceRecord.employeeId, emp.id), eq(attendanceRecord.date, day)))
    .limit(1);

  const kind = !existing || !existing.checkIn ? 'IN' : 'OUT';
  if (decision.outcome !== 'OK' && (!existing || !existing.checkOut)) {
    await record(kind); // refused attempts are kept, they change no attendance
    return fail(refusalMessage(decision, fence, emp.branchName ?? 'your branch'));
  }

  if (!existing || !existing.checkIn) {
    const where = {
      status: 'PRESENT' as const,
      checkIn: now,
      source: 'SELF' as const,
      latitude: hasGeo ? geo.data!.lat! : null,
      longitude: hasGeo ? geo.data!.lng! : null,
    };
    await db
      .insert(attendanceRecord)
      .values({ companyId, employeeId: emp.id, date: day, ...where })
      .onConflictDoUpdate({ target: [attendanceRecord.employeeId, attendanceRecord.date], set: where });
    await record('IN');
    revalidatePath('/dashboard');
    revalidatePath('/attendance');
    return done('Checked in.');
  }
  if (!existing.checkOut) {
    await db.update(attendanceRecord).set({ checkOut: now }).where(eq(attendanceRecord.id, existing.id));
    await record('OUT');
    revalidatePath('/dashboard');
    return done('Checked out. Have a good evening.');
  }
  return fail('You have already checked in and out today.');
}
