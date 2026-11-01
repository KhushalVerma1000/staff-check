import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db, branch, department, employee } from '@/db';
import { ActionForm } from '@/components/action-form';
import { EmployeeFields } from '@/components/employee-fields';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { requireCompanyActor } from '@/lib/session';
import { headcount } from '@/lib/tenant/headcount';
import { createEmployeeAction } from '../actions';

export const metadata = { title: 'Add employee' };

export default async function NewEmployeePage() {
  const actor = await requireCompanyActor('employee:create');
  const [hc, branches, departments, managers] = await Promise.all([
    headcount(actor.companyId),
    db
      .select({ id: branch.id, name: branch.name })
      .from(branch)
      .where(and(eq(branch.companyId, actor.companyId), eq(branch.active, true)))
      .orderBy(asc(branch.name)),
    db
      .select({ id: department.id, name: department.name })
      .from(department)
      .where(eq(department.companyId, actor.companyId))
      .orderBy(asc(department.name)),
    db
      .select({ id: employee.id, name: employee.name })
      .from(employee)
      .where(and(eq(employee.companyId, actor.companyId), eq(employee.status, 'ACTIVE')))
      .orderBy(asc(employee.name)),
  ]);
  if (hc.room <= 0) redirect('/employees');

  return (
    <>
      <PageHeader title="Add employee" description={`${hc.room} of ${hc.limit} seats free.`} />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <ActionForm action={createEmployeeAction} submitLabel="Add employee">
            <EmployeeFields
              branches={branches}
              departments={departments}
              managers={managers}
              defaults={{ joinedOn: new Date().toISOString().slice(0, 10) }}
            />
          </ActionForm>
        </CardContent>
      </Card>
      <p className="mt-4 text-sm">
        <Link href="/employees" className="text-blue-700 hover:underline">
          ← Back to employees
        </Link>
      </p>
    </>
  );
}
