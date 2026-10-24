import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';
import { createDepartmentAction, deleteDepartmentAction } from './actions';

export const metadata = { title: 'Departments' };

export default async function DepartmentsPage() {
  const actor = await requireCompanyActor('department:manage');
  const departments = await prisma.department.findMany({
    where: { companyId: actor.companyId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { employees: true } } },
  });

  return (
    <>
      <PageHeader title="Departments" description="Group your team the way your business works: Accounts, Sales, Operations…" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Departments</CardTitle>
          </CardHeader>
          <CardContent>
            {departments.length === 0 ? (
              <p className="text-sm text-gray-500">No departments yet.</p>
            ) : (
              <ul className="divide-y">
                {departments.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{d.name}</p>
                      <p className="text-sm text-gray-500">{d._count.employees} people</p>
                    </div>
                    {d._count.employees === 0 && (
                      <form action={deleteDepartmentAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Remove
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a department</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createDepartmentAction} submitLabel="Add department" resetOnSuccess>
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" placeholder="e.g. Accounts" required />
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
