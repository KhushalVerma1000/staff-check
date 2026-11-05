import Link from 'next/link';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ESIC_GROSS_LIMIT, PF_WAGE_CEILING } from '@/lib/payroll/compute';
import { formatINR } from '@/lib/payroll/money';
import { loadPaySettings } from '@/lib/payroll/run';
import { requireCompanyActor } from '@/lib/session';
import { savePayrollSettingsAction } from './actions';

export const metadata = { title: 'Payroll settings' };

export default async function PayrollSettingsPage() {
  const actor = await requireCompanyActor('payroll:manage');
  const s = await loadPaySettings(actor.companyId);

  return (
    <>
      <PageHeader
        title="PF, ESIC and professional tax"
        description="Employee-side deductions. Everything is off until you turn it on. Confirm the rules with your accountant before the first real run."
        actions={
          <Link href="/payroll" className="text-sm text-blue-700 hover:underline">
            Back to payroll
          </Link>
        }
      />
      <Card className="max-w-xl">
        <CardContent className="p-4">
          <ActionForm action={savePayrollSettingsAction} submitLabel="Save">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="pf" defaultChecked={s.pf} className="mt-1 h-4 w-4" />
              <span>
                <span className="font-medium text-gray-900">Provident fund (PF)</span>
                <span className="block text-gray-500">12% of earned basic, with basic capped at {formatINR(PF_WAGE_CEILING)}.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="esic" defaultChecked={s.esic} className="mt-1 h-4 w-4" />
              <span>
                <span className="font-medium text-gray-900">ESIC</span>
                <span className="block text-gray-500">
                  0.75% of earned gross, rounded up to the next rupee, for people whose monthly gross is {formatINR(ESIC_GROSS_LIMIT)} or less.
                </span>
              </span>
            </label>
            <Field label="Professional tax per month (₹)" htmlFor="professionalTax" hint="A flat amount for everyone who earned that month. State slabs are not modelled. Blank means none.">
              <Input id="professionalTax" name="professionalTax" inputMode="decimal" defaultValue={s.professionalTax ? String(s.professionalTax / 100) : ''} placeholder="0" className="w-40" />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
