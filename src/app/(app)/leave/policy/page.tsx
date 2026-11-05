import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LEAVE_TYPES } from '@/lib/leave/balance';
import { companyAllowances } from '@/lib/leave/queries';
import { LEAVE_TYPE_LABEL } from '@/lib/labels';
import { requireCompanyActor } from '@/lib/session';
import { saveLeavePolicyAction } from './actions';

export const metadata = { title: 'Leave policy' };

export default async function LeavePolicyPage() {
  const actor = await requireCompanyActor('leavePolicy:manage');
  const allowance = await companyAllowances(actor.companyId);

  return (
    <>
      <PageHeader title="Leave policy" description="Days each person can take per calendar year. Leave a box blank for no limit." />
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Yearly allowance</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveLeavePolicyAction} submitLabel="Save policy">
            {LEAVE_TYPES.map((t) => (
              <Field key={t} label={`${LEAVE_TYPE_LABEL[t]} leave (days)`} htmlFor={t}>
                <Input id={t} name={t} type="number" min={0} max={366} step={0.5} defaultValue={allowance[t] ?? ''} placeholder="No limit" />
              </Field>
            ))}
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
