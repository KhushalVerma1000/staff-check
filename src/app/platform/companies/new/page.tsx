import Link from 'next/link';
import { ActionForm, Field } from '@/components/action-form';
import { CompanyFields } from '@/components/company-fields';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createCompanyAction } from '../actions';

export const metadata = { title: 'New company' };

export default function NewCompanyPage() {
  return (
    <>
      <PageHeader title="Add a client company" description="Creates the company, its head office and the first admin login." />
      <ActionForm action={createCompanyAction} submitLabel="Create company" className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CompanyFields />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Timezone" htmlFor="timezone" hint="Decides what “today” means for attendance.">
                <Input id="timezone" name="timezone" defaultValue="Asia/Kolkata" />
              </Field>
              <Field label="Free trial (days)" htmlFor="trialDays" hint="0 starts them as active.">
                <Input id="trialDays" name="trialDays" type="number" min={0} max={90} defaultValue={14} />
              </Field>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">First admin</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Admin name" htmlFor="adminName">
              <Input id="adminName" name="adminName" required />
            </Field>
            <Field label="Admin email" htmlFor="adminEmail" hint="They sign in with this and a one-time password.">
              <Input id="adminEmail" name="adminEmail" type="email" required />
            </Field>
          </CardContent>
        </Card>
      </ActionForm>
      <p className="mt-4 text-sm">
        <Link href="/platform/companies" className="text-blue-700 hover:underline">
          ← Back to companies
        </Link>
      </p>
    </>
  );
}
