import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { EmployeeFields } from '@/components/employee-fields';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';
import { headcount } from '@/lib/tenant/headcount';
import { createEmployeeAction } from '../actions';

export const metadata = { title: 'Add employee' };

export default async function NewEmployeePage() {
  const actor = await requireCompanyActor('employee:create');
  const [hc, branches, departments, managers] = await Promise.all([
    headcount(actor.companyId),
    prisma.branch.findMany({ where: { companyId: actor.companyId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { companyId: actor.companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.employee.findMany({ where: { companyId: actor.companyId, status: 'ACTIVE' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
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
