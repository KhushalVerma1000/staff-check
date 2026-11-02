'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, employee, employeeKyc, type SkipReason } from '@/db';
import { fail, type ActionResult } from '@/lib/action-result';
import { audit } from '@/lib/audit';
import { assertCan } from '@/lib/auth/can';
import { encryptField } from '@/lib/crypto';
import { optional, text } from '@/lib/form';
import * as v from '@/lib/kyc/validate';
import { getActor } from '@/lib/session';
import { companyIdOf } from '@/lib/tenant/scope';

const SKIPS: readonly SkipReason[] = ['NOT_YET', 'NOT_APPLICABLE', 'WILL_BRING_DOC'];

type Secret = { enc: string | null | undefined; skip: SkipReason | null | undefined };

/**
 * One statutory / bank number from the form.
 *  - value given        → validate, encrypt, clear any skip reason
 *  - blank + skip chosen → clear the stored value, record why
 *  - blank, nothing else → keep what is stored; if nothing is, record "not yet"
 */
function secret(
  fd: FormData,
  name: string,
  existing: string | null,
  check: (s: string) => string | null,
  norm: (s: string) => string,
): { error: string } | Secret {
  const raw = text(fd, name);
  const picked = text(fd, `${name}Skip`) as SkipReason;
  if (raw) {
    const err = check(raw);
    if (err) return { error: err };
    return { enc: encryptField(norm(raw)), skip: null };
  }
  if (SKIPS.includes(picked)) return { enc: null, skip: picked };
  return existing ? { enc: undefined, skip: undefined } : { enc: null, skip: 'NOT_YET' };
}

const isErr = (x: { error: string } | Secret): x is { error: string } => 'error' in x;

async function myKyc(companyId: string, employeeId: string) {
  await db.insert(employeeKyc).values({ companyId, employeeId }).onConflictDoNothing({ target: employeeKyc.employeeId });
  const [row] = await db
    .select()
    .from(employeeKyc)
    .where(and(eq(employeeKyc.employeeId, employeeId), eq(employeeKyc.companyId, companyId)))
    .limit(1);
  return row;
}

const EDITABLE = ['IN_PROGRESS', 'CHANGES_REQUESTED'];

/** Save one wizard step (1 About you, 2 ID and statutory, 3 Bank, 4 Address), then go to the next. */
export async function saveStepAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'onboarding:self', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  if (!actor.employeeId) return fail('Your login is not linked to a staff record. Ask HR to link it.');

  const step = Number(text(fd, 'step'));
  if (![1, 2, 3, 4].includes(step)) return fail('Unknown step.');
  const row = await myKyc(companyId, actor.employeeId);
  if (!EDITABLE.includes(row.status)) return fail('Your details are with HR and cannot be edited now.');

  let set: Partial<typeof employeeKyc.$inferInsert> = {};
  try {
    if (step === 1) {
      const dobRaw = optional(fd, 'dob');
      let dob: Date | null = null;
      if (dobRaw) {
        dob = new Date(`${dobRaw}T00:00:00Z`);
        if (Number.isNaN(dob.getTime()) || dob > new Date() || dob.getUTCFullYear() < 1940) return fail('Enter a valid date of birth.');
      }
      const phone = optional(fd, 'phone');
      if (phone && !/^[0-9+\-\s]{7,15}$/.test(phone)) return fail('Enter a valid phone number.');
      set = { dob };
      if (phone) await db.update(employee).set({ phone }).where(and(eq(employee.id, actor.employeeId), eq(employee.companyId, companyId)));
    } else if (step === 2) {
      const a = secret(fd, 'aadhaar', row.aadhaarEnc, v.aadhaarError, v.normalize.digits);
      const p = secret(fd, 'pan', row.panEnc, v.panError, v.normalize.upper);
      const u = secret(fd, 'uan', row.uanEnc, v.uanError, v.normalize.digits);
      const e = secret(fd, 'esic', row.esicEnc, v.esicError, v.normalize.digits);
      for (const r of [a, p, u, e]) if (isErr(r)) return fail(r.error);
      const [A, P, U, E] = [a, p, u, e] as Secret[];
      set = {
        ...(A.enc !== undefined && { aadhaarEnc: A.enc, aadhaarSkip: A.skip }),
        ...(P.enc !== undefined && { panEnc: P.enc, panSkip: P.skip }),
        ...(U.enc !== undefined && { uanEnc: U.enc, uanSkip: U.skip }),
        ...(E.enc !== undefined && { esicEnc: E.enc, esicSkip: E.skip }),
      };
    } else if (step === 3) {
      const holder = optional(fd, 'bankHolder');
      const bankName = optional(fd, 'bankName');
      const ifscRaw = optional(fd, 'ifsc');
      if (ifscRaw) {
        const err = v.ifscError(ifscRaw);
        if (err) return fail(err);
      }
      const acct = secret(fd, 'account', row.accountEnc, v.accountError, v.normalize.digits);
      if (isErr(acct)) return fail(acct.error);
      set = {
        bankHolder: holder ?? null,
        bankName: bankName ?? null,
        ifsc: ifscRaw ? v.normalize.upper(ifscRaw) : null,
        ...(acct.enc !== undefined && { accountEnc: acct.enc, bankSkip: acct.skip }),
      };
    } else {
      const pin = optional(fd, 'pincode');
      if (pin) {
        const err = v.pincodeError(pin);
        if (err) return fail(err);
      }
      set = {
        addrLine1: optional(fd, 'addrLine1') ?? null,
        addrLine2: optional(fd, 'addrLine2') ?? null,
        city: optional(fd, 'city') ?? null,
        state: optional(fd, 'state') ?? null,
        pincode: pin ?? null,
      };
    }
  } catch (e) {
    // Most likely a missing KYC_ENCRYPTION_KEY. Never store a number unencrypted.
    console.error('onboarding save failed', e);
    return fail('Could not save securely right now. Please tell your admin.');
  }

  await db
    .update(employeeKyc)
    .set({ ...set, step: Math.max(row.step, step + 1) })
    .where(eq(employeeKyc.id, row.id));
  await audit({ companyId, userId: actor.id, action: 'onboarding.save', entity: 'EmployeeKyc', entityId: row.id, detail: `step ${step}` });
  revalidatePath('/onboarding');
  redirect(`/onboarding?step=${step + 1}`);
}

/** Send the finished details to HR for review. */
export async function submitOnboardingAction(_p: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, 'onboarding:self', { companyId: actor?.companyId });
  const companyId = companyIdOf(actor);
  if (!actor.employeeId) return fail('Your login is not linked to a staff record.');

  const row = await myKyc(companyId, actor.employeeId);
  if (!EDITABLE.includes(row.status)) return fail('Already submitted.');
  await db
    .update(employeeKyc)
    .set({ status: 'SUBMITTED', submittedAt: new Date(), step: 5 })
    .where(eq(employeeKyc.id, row.id));
  await audit({ companyId, userId: actor.id, action: 'onboarding.submit', entity: 'EmployeeKyc', entityId: row.id });
  revalidatePath('/onboarding');
  redirect('/onboarding');
}
