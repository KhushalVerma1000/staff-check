import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { db, employee, employeeKyc, type SkipReason } from '@/db';
import { decryptField } from '@/lib/crypto';
import { SKIP_LABEL } from '@/lib/kyc/labels';
import { maskTail } from '@/lib/kyc/validate';
import { requireCompanyActor } from '@/lib/session';
import { saveStepAction, submitOnboardingAction } from './actions';

export const metadata = { title: 'My onboarding' };

const STEPS = ['About you', 'ID and statutory', 'Bank account', 'Address', 'Review'];

function masked(enc: string | null): string {
  if (!enc) return '—';
  try {
    return maskTail(decryptField(enc));
  } catch {
    return '(unreadable)';
  }
}

function SkipSelect({ name, current }: { name: string; current: SkipReason | null }) {
  return (
    <NativeSelect name={`${name}Skip`} defaultValue="" aria-label="Skip this for now">
      <option value="">{current ? `Currently: ${SKIP_LABEL[current]}` : 'Skip this for now…'}</option>
      {(Object.keys(SKIP_LABEL) as SkipReason[]).map((k) => (
        <option key={k} value={k}>
          {SKIP_LABEL[k]}
        </option>
      ))}
    </NativeSelect>
  );
}

function Secret({ id, label, hint, enc, skip, placeholder }: { id: string; label: string; hint?: string; enc: string | null; skip: SkipReason | null; placeholder?: string }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Field label={label} htmlFor={id} hint={enc ? `Saved (${masked(enc)}). Leave blank to keep it.` : hint}>
        <Input id={id} name={id} autoComplete="off" spellCheck={false} placeholder={placeholder} />
      </Field>
      <SkipSelect name={id} current={skip} />
    </div>
  );
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const actor = await requireCompanyActor('onboarding:self');
  if (!actor.employeeId) {
    return (
      <>
        <PageHeader title="My onboarding" />
        <p className="text-sm text-gray-600">Your login is not linked to a staff record yet. Ask HR to link it, then come back here.</p>
      </>
    );
  }
  const [emp] = await db
    .select({ name: employee.name, phone: employee.phone })
    .from(employee)
    .where(and(eq(employee.id, actor.employeeId), eq(employee.companyId, actor.companyId)))
    .limit(1);
  const [k] = await db
    .select()
    .from(employeeKyc)
    .where(and(eq(employeeKyc.employeeId, actor.employeeId), eq(employeeKyc.companyId, actor.companyId)))
    .limit(1);

  const status = k?.status ?? 'IN_PROGRESS';
  const locked = status === 'SUBMITTED' || status === 'APPROVED';
  const { step: stepParam } = await searchParams;
  const step = Math.min(5, Math.max(1, Number(stepParam) || k?.step || 1));

  return (
    <>
      <PageHeader title="My onboarding" description="Takes about 5 minutes. Skip anything you do not have; HR will follow up. Your progress is saved." />
      {status === 'CHANGES_REQUESTED' && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          HR asked for changes{k?.reviewNote ? `: ${k.reviewNote}` : '.'} Update the details and submit again.
        </p>
      )}
      {locked ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {status === 'APPROVED' ? 'Approved' : 'Submitted'} <Badge className="ml-2">{status === 'APPROVED' ? 'Approved' : 'With HR'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-gray-700">
            <p>Aadhaar {masked(k!.aadhaarEnc)} · PAN {masked(k!.panEnc)} · UAN {masked(k!.uanEnc)} · ESIC {masked(k!.esicEnc)}</p>
            <p>Bank account {masked(k!.accountEnc)} {k!.ifsc ? `(${k!.ifsc})` : ''}</p>
            <p className="text-xs text-gray-500">To change something, ask HR to send it back.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4">
          <nav aria-label="Onboarding steps" className="lg:col-span-1">
            <ol className="space-y-1">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <Link
                    href={`/onboarding?step=${i + 1}`}
                    aria-current={step === i + 1 ? 'step' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${step === i + 1 ? 'bg-blue-50 font-semibold text-blue-900' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">{(k?.step ?? 1) > i + 1 ? '✓' : i + 1}</span>
                    {s}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">
                Step {step} of 5: {STEPS[step - 1]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {step === 1 && (
                <ActionForm action={saveStepAction} submitLabel="Save and continue">
                  <input type="hidden" name="step" value="1" />
                  <p className="text-sm text-gray-600">Hello {emp?.name}.</p>
                  <Field label="Phone" htmlFor="phone">
                    <Input id="phone" name="phone" inputMode="tel" defaultValue={emp?.phone ?? ''} />
                  </Field>
                  <Field label="Date of birth" htmlFor="dob">
                    <Input id="dob" name="dob" type="date" defaultValue={k?.dob ? k.dob.toISOString().slice(0, 10) : ''} />
                  </Field>
                </ActionForm>
              )}
              {step === 2 && (
                <ActionForm action={saveStepAction} submitLabel="Save and continue">
                  <input type="hidden" name="step" value="2" />
                  <Secret id="aadhaar" label="Aadhaar number" hint="12 digits. Only the last 4 are shown to HR." enc={k?.aadhaarEnc ?? null} skip={k?.aadhaarSkip ?? null} />
                  <Secret id="pan" label="PAN" hint="Like ABCDE1234F." enc={k?.panEnc ?? null} skip={k?.panSkip ?? null} />
                  <Secret id="uan" label="UAN (PF)" hint="If you worked before, your old UAN stays with you." enc={k?.uanEnc ?? null} skip={k?.uanSkip ?? null} />
                  <Secret id="esic" label="ESIC IP number" hint="Only if you are covered by ESIC." enc={k?.esicEnc ?? null} skip={k?.esicSkip ?? null} />
                </ActionForm>
              )}
              {step === 3 && (
                <ActionForm action={saveStepAction} submitLabel="Save and continue">
                  <input type="hidden" name="step" value="3" />
                  <Field label="Name on the account" htmlFor="bankHolder">
                    <Input id="bankHolder" name="bankHolder" defaultValue={k?.bankHolder ?? ''} />
                  </Field>
                  <Field label="Bank" htmlFor="bankName">
                    <Input id="bankName" name="bankName" defaultValue={k?.bankName ?? ''} />
                  </Field>
                  <Field label="IFSC" htmlFor="ifsc">
                    <Input id="ifsc" name="ifsc" defaultValue={k?.ifsc ?? ''} />
                  </Field>
                  <Secret id="account" label="Account number" hint="9 to 18 digits. Only the last 4 are shown to HR." enc={k?.accountEnc ?? null} skip={k?.bankSkip ?? null} />
                </ActionForm>
              )}
              {step === 4 && (
                <ActionForm action={saveStepAction} submitLabel="Save and continue">
                  <input type="hidden" name="step" value="4" />
                  <Field label="Address line 1" htmlFor="addrLine1">
                    <Input id="addrLine1" name="addrLine1" defaultValue={k?.addrLine1 ?? ''} />
                  </Field>
                  <Field label="Address line 2" htmlFor="addrLine2">
                    <Input id="addrLine2" name="addrLine2" defaultValue={k?.addrLine2 ?? ''} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="City" htmlFor="city">
                      <Input id="city" name="city" defaultValue={k?.city ?? ''} />
                    </Field>
                    <Field label="State" htmlFor="state">
                      <Input id="state" name="state" defaultValue={k?.state ?? ''} />
                    </Field>
                    <Field label="PIN code" htmlFor="pincode">
                      <Input id="pincode" name="pincode" inputMode="numeric" defaultValue={k?.pincode ?? ''} />
                    </Field>
                  </div>
                </ActionForm>
              )}
              {step === 5 && (
                <ActionForm action={submitOnboardingAction} submitLabel="Send to HR">
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    {[
                      ['Aadhaar', k?.aadhaarEnc ? masked(k.aadhaarEnc) : k?.aadhaarSkip ? SKIP_LABEL[k.aadhaarSkip] : 'Not filled'],
                      ['PAN', k?.panEnc ? masked(k.panEnc) : k?.panSkip ? SKIP_LABEL[k.panSkip] : 'Not filled'],
                      ['UAN', k?.uanEnc ? masked(k.uanEnc) : k?.uanSkip ? SKIP_LABEL[k.uanSkip] : 'Not filled'],
                      ['ESIC', k?.esicEnc ? masked(k.esicEnc) : k?.esicSkip ? SKIP_LABEL[k.esicSkip] : 'Not filled'],
                      ['Bank account', k?.accountEnc ? masked(k.accountEnc) : k?.bankSkip ? SKIP_LABEL[k.bankSkip] : 'Not filled'],
                      ['Address', [k?.addrLine1, k?.city, k?.pincode].filter(Boolean).join(', ') || 'Not filled'],
                    ].map(([a, b]) => (
                      <div key={a} className="rounded-lg border p-3">
                        <dt className="text-xs text-gray-500">{a}</dt>
                        <dd className="font-medium text-gray-900">{b}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs text-gray-500">HR sees what you skipped and why. Document uploads are added in a later release.</p>
                </ActionForm>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
