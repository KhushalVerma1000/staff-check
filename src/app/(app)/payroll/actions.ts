'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, count, eq, sum } from 'drizzle-orm';
import { db, company, payrollRun, payslip } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { text } from '@/lib/form';
import { formatINR } from '@/lib/payroll/money';
import { buildRunLines } from '@/lib/payroll/run';
import { isMonthKey } from '@/lib/reports';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';
import { monthOf, todayKey } from '@/lib/tenant/time';

async function companyToday(companyId: string): Promise<string> {
  const [c] = await db.select({ tz: company.timezone }).from(company).where(eq(company.id, companyId)).limit(1);
  return todayKey(c?.tz ?? 'UTC');
}

/** Start a DRAFT run for a month: pay is worked out from attendance and salary structures and can be recalculated until finalized. */
export async function createRunAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'payroll:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const month = text(fd, 'month');
  if (!isMonthKey(month)) return fail('Choose a month.');
  if (month > monthOf(await companyToday(companyId))) return fail('You can only run payroll for this month or an earlier one.');

  const [existing] = await db.select({ id: payrollRun.id }).from(payrollRun).where(and(eq(payrollRun.companyId, companyId), eq(payrollRun.month, month))).limit(1);
  if (existing) return fail(`A payroll run for ${month} already exists.`);

  const { lines } = await buildRunLines(companyId, month);
  if (lines.length === 0) return fail('Nobody employed that month has a salary set yet. Add salaries first.');

  let runId: string;
  try {
    runId = await db.transaction(async (tx) => {
      const [run] = await tx.insert(payrollRun).values({ companyId, month, createdById: actor.id }).returning({ id: payrollRun.id });
      await tx.insert(payslip).values(lines.map((l) => ({ ...l, runId: run.id })));
      return run.id;
    });
  } catch {
    return fail(`A payroll run for ${month} already exists.`);
  }
  await audit({ companyId, userId: actor.id, action: 'payroll.run.create', entity: 'PayrollRun', entityId: runId, detail: `${month}, ${lines.length} people` });
  revalidatePath('/payroll');
  redirect(`/payroll/${month}`);
}

/** Recompute a DRAFT run from the latest attendance and salaries. Finalized runs are never touched. */
export async function recalcRunAction(fd: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'payroll:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  const id = text(fd, 'id');

  const [run] = await db.select().from(payrollRun).where(and(eq(payrollRun.id, id), eq(payrollRun.companyId, companyId), eq(payrollRun.status, 'DRAFT'))).limit(1);
  if (!run) return;
  const { lines } = await buildRunLines(companyId, run.month);
  await db.transaction(async (tx) => {
    await tx.delete(payslip).where(eq(payslip.runId, run.id));
    if (lines.length) await tx.insert(payslip).values(lines.map((l) => ({ ...l, runId: run.id })));
  });
  await audit({ companyId, userId: actor.id, action: 'payroll.run.recalc', entity: 'PayrollRun', entityId: run.id, detail: run.month });
  revalidatePath(`/payroll/${run.month}`);
}

/** Throw away a DRAFT run (e.g. made for the wrong month). */
export async function deleteDraftRunAction(fd: FormData): Promise<void> {
  const actor = await getActor();
  assertCan(actor, 'payroll:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  const id = text(fd, 'id');
  const [run] = await db.select().from(payrollRun).where(and(eq(payrollRun.id, id), eq(payrollRun.companyId, companyId), eq(payrollRun.status, 'DRAFT'))).limit(1);
  if (!run) return;
  await db.delete(payslip).where(eq(payslip.runId, run.id));
  await db.delete(payrollRun).where(and(eq(payrollRun.id, run.id), eq(payrollRun.status, 'DRAFT')));
  await audit({ companyId, userId: actor.id, action: 'payroll.run.delete', entity: 'PayrollRun', entityId: run.id, detail: run.month });
  revalidatePath('/payroll');
  redirect('/payroll');
}

/**
 * Lock a DRAFT run. Refuses when anyone has unmarked attendance days unless the person finalizing says so,
 * because unmarked days are paid as absent. After this the run and its payslips cannot change.
 */
export async function finalizeRunAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'payroll:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  const id = text(fd, 'id');

  const [run] = await db.select().from(payrollRun).where(and(eq(payrollRun.id, id), eq(payrollRun.companyId, companyId))).limit(1);
  if (!run) return fail('That payroll run was not found.');
  if (run.status !== 'DRAFT') return fail('This run is already finalized.');

  const [t] = await db
    .select({ people: count(), unmarked: sum(payslip.unmarkedDays).mapWith(Number), net: sum(payslip.netPaise).mapWith(Number) })
    .from(payslip)
    .where(eq(payslip.runId, run.id));
  if (!t || t.people === 0) return fail('This run has no payslips.');
  if ((t.unmarked ?? 0) > 0 && text(fd, 'acknowledge') !== 'on') {
    return fail(`${t.unmarked} working days have no attendance and will be paid as absent. Mark them, recalculate, or tick the box to finalize anyway.`);
  }

  const [locked] = await db
    .update(payrollRun)
    .set({ status: 'FINALIZED', finalizedAt: new Date(), finalizedById: actor.id })
    .where(and(eq(payrollRun.id, run.id), eq(payrollRun.status, 'DRAFT')))
    .returning({ id: payrollRun.id });
  if (!locked) return fail('This run was finalized by someone else just now.');
  await audit({
    companyId,
    userId: actor.id,
    action: 'payroll.run.finalize',
    entity: 'PayrollRun',
    entityId: run.id,
    detail: `${run.month}, ${t.people} people, net ${formatINR(t.net ?? 0)}`,
  });
  revalidatePath(`/payroll/${run.month}`);
  revalidatePath('/payroll');
  revalidatePath('/payslips');
  return done('Payroll finalized. It can no longer be changed.');
}
