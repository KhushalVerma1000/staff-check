import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';
import { createBranchAction, toggleBranchAction } from './actions';

export const metadata = { title: 'Branches' };

export default async function BranchesPage() {
  const actor = await requireCompanyActor('branch:manage');
  const branches = await prisma.branch.findMany({
    where: { companyId: actor.companyId },
    orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { employees: { where: { status: 'ACTIVE' } } } } },
  });

  return (
    <>
      <PageHeader
        title="Branches"
        description="Offices and field locations where your people work. The first one you add is your head office."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Your locations</CardTitle>
          </CardHeader>
          <CardContent>
            {branches.length === 0 ? (
              <p className="text-sm text-gray-500">No branches yet. Add your first office on the right.</p>
            ) : (
              <ul className="divide-y">
                {branches.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {b.name} {b.isHeadOffice && <Badge className="ml-1">Head office</Badge>}{' '}
                        {!b.active && <Badge variant="secondary">Inactive</Badge>}
                      </p>
                      <p className="text-sm text-gray-500">
                        {b.type === 'OFFICE' ? 'Office' : 'Field'}
                        {b.city ? ` · ${b.city}` : ''} · {b._count.employees} active staff
                      </p>
                    </div>
                    <form action={toggleBranchAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <Button type="submit" variant="outline" size="sm">
                        {b.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a branch</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createBranchAction} submitLabel="Add branch" resetOnSuccess>
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" placeholder="e.g. Head office, Pune site" required />
              </Field>
              <Field label="Type" htmlFor="type">
                <NativeSelect id="type" name="type" defaultValue="OFFICE">
                  <option value="OFFICE">Office</option>
                  <option value="FIELD">Field / site</option>
                </NativeSelect>
              </Field>
              <Field label="City" htmlFor="city">
                <Input id="city" name="city" />
              </Field>
              <Field label="Address" htmlFor="address">
                <Input id="address" name="address" />
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
