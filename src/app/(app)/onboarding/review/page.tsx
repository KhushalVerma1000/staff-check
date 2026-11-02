import { and, asc, eq } from 'drizzle-orm';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { db, employee, type OnboardingStatus } from '@/db';
import { decryptField } from '@/lib/crypto';
import { SKIP_LABEL } from '@/lib/kyc/labels';
import { maskTail } from '@/lib/kyc/validate';
import { requireCompanyActor } from '@/lib/session';
import { reviewAction } from './actions';

export const metadata = { title: 'Onboarding review' };

const LABEL: Record<OnboardingStatus | 'NOT_STARTED', string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Waiting for review',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
};

function show(enc: string | null, skip: keyof typeof SKIP_LABEL | null): string {
  if (enc) {
    try {
      return maskTail(decryptField(enc));
    } catch {
      return '(unreadable)';
    }
  }
  return skip ? `Skipped: ${SKIP_LABEL[skip]}` : '—';
}

export default async function OnboardingReviewPage() {
  const actor = await requireCompanyActor('onboarding:review');
  const rows = await db.query.employee.findMany({
    where: and(eq(employee.companyId, actor.companyId), eq(employee.status, 'ACTIVE')),
    orderBy: asc(employee.name),
    with: { kyc: true },
  });
  const status = (r: (typeof rows)[number]) => (r.kyc?.status ?? 'NOT_STARTED') as OnboardingStatus | 'NOT_STARTED';
  const counts = rows.reduce<Record<string, number>>((m, r) => ((m[status(r)] = (m[status(r)] ?? 0) + 1), m), {});
  const waiting = rows.filter((r) => status(r) === 'SUBMITTED');

  return (
    <>
      <PageHeader title="Onboarding review" description="Check submitted details, approve them, or send them back. Numbers are masked to the last 4 digits." />
      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(LABEL) as Array<keyof typeof LABEL>).map((k) => (
          <Badge key={k} variant={k === 'SUBMITTED' ? 'default' : 'secondary'}>
            {LABEL[k]}: {counts[k] ?? 0}
          </Badge>
        ))}
      </div>
      {waiting.length > 0 && (
        <div className="mb-8 space-y-4">
          {waiting.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {r.name} <span className="text-sm font-normal text-gray-500">({r.code})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  {[
                    ['Aadhaar', show(r.kyc!.aadhaarEnc, r.kyc!.aadhaarSkip)],
                    ['PAN', show(r.kyc!.panEnc, r.kyc!.panSkip)],
                    ['UAN', show(r.kyc!.uanEnc, r.kyc!.uanSkip)],
                    ['ESIC', show(r.kyc!.esicEnc, r.kyc!.esicSkip)],
                    ['Bank account', `${show(r.kyc!.accountEnc, r.kyc!.bankSkip)}${r.kyc!.ifsc ? ` · ${r.kyc!.ifsc}` : ''}`],
                    ['Address', [r.kyc!.addrLine1, r.kyc!.city, r.kyc!.state, r.kyc!.pincode].filter(Boolean).join(', ') || '—'],
                  ].map(([a, b]) => (
                    <div key={a}>
                      <dt className="text-xs text-gray-500">{a}</dt>
                      <dd className="text-gray-900">{b}</dd>
                    </div>
                  ))}
                </dl>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ActionForm action={reviewAction} submitLabel="Approve">
                    <input type="hidden" name="id" value={r.kyc!.id} />
                    <input type="hidden" name="decision" value="APPROVED" />
                  </ActionForm>
                  <ActionForm action={reviewAction} submitLabel="Send back" variant="outline">
                    <input type="hidden" name="id" value={r.kyc!.id} />
                    <input type="hidden" name="decision" value="CHANGES_REQUESTED" />
                    <Field label="What should they fix?" htmlFor={`note-${r.id}`}>
                      <Input id={`note-${r.id}`} name="note" />
                    </Field>
                  </ActionForm>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Everyone</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>
                  {r.name} <span className="text-gray-500">({r.code})</span>
                </span>
                <Badge variant={status(r) === 'APPROVED' ? 'default' : 'secondary'}>{LABEL[status(r)]}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
