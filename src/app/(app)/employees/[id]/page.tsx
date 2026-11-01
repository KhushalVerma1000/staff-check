import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db, branch, department, employee } from '@/db';
import { ActionForm } from '@/components/action-form';
import { EmployeeFields } from '@/components/employee-fields';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { can } from '@/lib/auth/can';
import { fmtDate, WORK_TYPE_LABEL } from '@/lib/labels';
import { requireCompanyActor } from '@/lib/session';
import { headcount } from '@/lib/tenant/headcount';
import { canSeeEmployee } from '@/lib/tenant/scope';
import { setEmployeeStatusAction, updateEmployeeAction } from '../actions';

export const metadata = { title: 'Employee' };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireCompanyActor('employee:view');

  const emp = await db.query.employee.findFirst({
    where: and(eq(employee.id, id), eq(employee.companyId, actor.companyId)),
    with: {
      branch: { columns: { name: true } },
      department: { columns: { name: true } },
      manager: { columns: { name: true } },
      reports: { where: eq(employee.status, 'ACTIVE'), columns: { id: true, name: true } },
    },
  });
  if (!emp || !canSeeEmployee(actor, emp)) notFound();

  const canEdit = can(actor, 'employee:edit', { companyId: emp.companyId });
  const [branches, departments, managers, hc] = canEdit
    ? await Promise.all([
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
          .where(and(eq(employee.companyId, actor.companyId), eq(employee.status, 'ACTIVE'), ne(employee.id, emp.id)))
          .orderBy(asc(employee.name)),
        headcount(actor.companyId),
      ])
    : [[], [], [], null];

  return (
    <>
      <PageHeader
        title={emp.name}
        description={`${emp.code}${emp.designation ? ` · ${emp.designation}` : ''}`}
        actions={emp.status === 'INACTIVE' ? <Badge variant="secondary">Inactive</Badge> : <Badge>Active</Badge>}
      />

      {canEdit ? (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateEmployeeAction} submitLabel="Save changes">
              <input type="hidden" name="id" value={emp.id} />
              <EmployeeFields
                branches={branches}
                departments={departments}
                managers={managers}
                defaults={{
                  name: emp.name,
                  code: emp.code,
                  email: emp.email,
                  phone: emp.phone,
                  designation: emp.designation,
                  workType: emp.workType,
                  branchId: emp.branchId,
                  departmentId: emp.departmentId,
                  managerId: emp.managerId,
                  joinedOn: emp.joinedOn.toISOString().slice(0, 10),
                }}
                codeHint="Must be unique in your company."
              />
            </ActionForm>
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-3xl">
          <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
            <Detail label="Email" value={emp.email} />
            <Detail label="Phone" value={emp.phone} />
            <Detail label="Branch" value={emp.branch?.name} />
            <Detail label="Department" value={emp.department?.name} />
            <Detail label="Works at" value={WORK_TYPE_LABEL[emp.workType]} />
            <Detail label="Reports to" value={emp.manager?.name} />
            <Detail label="Joined" value={fmtDate(emp.joinedOn)} />
          </CardContent>
        </Card>
      )}

      {emp.reports.length > 0 && (
        <Card className="mt-6 max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Direct reports</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {emp.reports.map((r) => (
                <li key={r.id}>
                  <Link href={`/employees/${r.id}`} className="rounded-full border px-3 py-1 text-sm text-blue-700 hover:bg-blue-50">
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {can(actor, 'employee:deactivate', { companyId: emp.companyId }) && (
        <Card className="mt-6 max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">{emp.status === 'ACTIVE' ? 'Offboarding' : 'Reactivate'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            {emp.status === 'ACTIVE' ? (
              <>
                <p>
                  Deactivating marks the person as left today, removes them as a manager of others and switches off their login. Their
                  attendance and leave history stays.
                </p>
                <form action={setEmployeeStatusAction}>
                  <input type="hidden" name="id" value={emp.id} />
                  <input type="hidden" name="status" value="INACTIVE" />
                  <Button type="submit" variant="destructive">
                    Deactivate {emp.name}
                  </Button>
                </form>
              </>
            ) : hc && hc.room <= 0 ? (
              <p>All {hc.limit} seats are in use, so this person cannot be reactivated right now.</p>
            ) : (
              <form action={setEmployeeStatusAction}>
                <input type="hidden" name="id" value={emp.id} />
                <input type="hidden" name="status" value="ACTIVE" />
                <Button type="submit">Reactivate {emp.name}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-gray-900">{value || '—'}</p>
    </div>
  );
}
