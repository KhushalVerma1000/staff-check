import Link from 'next/link';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { ActionForm } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { db, employee, salaryStructure } from '@/db';
import { formatINR } from '@/lib/payroll/money';
import { requireCompanyActor } from '@/lib/session';
import { saveSalaryAction } from './actions';

export const metadata = { title: 'Salaries' };

const rupees = (paise: number) => (paise === 0 ? '' : String(paise / 100));

export default async function SalaryPage() {
  const actor = await requireCompanyActor('payroll:manage');
  const people = await db
    .select({
      id: employee.id,
      code: employee.code,
      name: employee.name,
      designation: employee.designation,
      basic: salaryStructure.basicPaise,
      hra: salaryStructure.hraPaise,
      other: salaryStructure.otherPaise,
      has: salaryStructure.id,
    })
    .from(employee)
    .leftJoin(salaryStructure, eq(salaryStructure.employeeId, employee.id))
    .where(and(eq(employee.companyId, actor.companyId), isNull(employee.exitedOn)))
    .orderBy(asc(employee.code));

  return (
    <>
      <PageHeader
        title="Salaries"
        description="Monthly pay for each person, in rupees. Changes apply to payroll runs created or recalculated afterwards; finalized runs never change."
        actions={
          <Link href="/payroll" className="text-sm text-blue-700 hover:underline">
            Back to payroll
          </Link>
        }
      />
      <div className="grid gap-3">
        {people.length === 0 && <p className="text-sm text-gray-500">Add employees first.</p>}
        {people.map((p) => (
          <Card key={p.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-gray-900">
                  {p.name} <span className="text-sm font-normal text-gray-500">{p.code}{p.designation ? ` · ${p.designation}` : ''}</span>
                </p>
                <p className="text-sm text-gray-600">
                  {p.has ? `${formatINR((p.basic ?? 0) + (p.hra ?? 0) + (p.other ?? 0))} a month` : 'No salary set'}
                </p>
              </div>
              <ActionForm action={saveSalaryAction} submitLabel="Save" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="employeeId" value={p.id} />
                {([['basic', 'Basic', p.basic], ['hra', 'HRA', p.hra], ['other', 'Other allowances', p.other]] as const).map(([name, label, v]) => (
                  <div key={name} className="space-y-1">
                    <label htmlFor={`${p.id}-${name}`} className="text-xs font-medium text-gray-700">
                      {label}
                    </label>
                    <Input id={`${p.id}-${name}`} name={name} inputMode="decimal" defaultValue={rupees(v ?? 0)} placeholder="0" className="w-36" />
                  </div>
                ))}
              </ActionForm>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
