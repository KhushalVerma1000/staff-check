'use server';

import { revalidatePath } from 'next/cache';
import { db, payrollSettings } from '@/db';
import { done, fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { text } from '@/lib/form';
import { parseRupees } from '@/lib/payroll/money';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

export async function savePayrollSettingsAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'payroll:manage', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);

  const ptRaw = text(fd, 'professionalTax');
  const pt = ptRaw === '' ? 0 : parseRupees(ptRaw);
  if (pt === null) return fail('Professional tax: enter an amount like 200.');
  const values = { pfEnabled: text(fd, 'pf') === 'on', esicEnabled: text(fd, 'esic') === 'on', professionalTaxPaise: pt };

  await db.insert(payrollSettings).values({ companyId, ...values }).onConflictDoUpdate({ target: payrollSettings.companyId, set: values });
  await audit({
    companyId,
    userId: actor.id,
    action: 'payroll.settings.save',
    entity: 'PayrollSettings',
    detail: `PF ${values.pfEnabled ? 'on' : 'off'}, ESIC ${values.esicEnabled ? 'on' : 'off'}, PT ${pt / 100}`,
  });
  revalidatePath('/payroll/settings');
  return done('Saved. Draft runs pick this up when recalculated.');
}
