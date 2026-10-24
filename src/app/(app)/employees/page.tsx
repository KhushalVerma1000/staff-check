import Link from 'next/link';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { can } from '@/lib/auth/can';
import { WORK_TYPE_LABEL } from '@/lib/labels';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';
import { headcount } from '@/lib/tenant/headcount';
import { employeeScope } from '@/lib/tenant/scope';

export const metadata = { title: 'Employees' };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branch?: string; dept?: string; status?: string }>;
}) {
  const actor = await requireCompanyActor('employee:view');
  const sp = await searchParams;
  const status = sp.status === 'INACTIVE' ? 'INACTIVE' : sp.status === 'ALL' ? undefined : 'ACTIVE';
  const q = sp.q?.trim();

  const [employees, branches, departments, hc] = await Promise.all([
    prisma.employee.findMany({
      where: {
        AND: [
          employeeScope(actor),
          {
            ...(status ? { status } : {}),
            ...(sp.branch ? { branchId: sp.branch } : {}),
            ...(sp.dept ? { departmentId: sp.dept } : {}),
            ...(q
              ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { code: { contains: q, mode: 'insensitive' as const } }] }
              : {}),
          },
        ],
      },
      orderBy: { name: 'asc' },
      include: { branch: { select: { name: true } }, department: { select: { name: true } }, manager: { select: { name: true } } },
    }),
    prisma.branch.findMany({ where: { companyId: actor.companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { companyId: actor.companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    headcount(actor.companyId),
  ]);

  const isManager = actor.role === 'MANAGER';

  return (
    <>
      <PageHeader
        title={isManager ? 'My team' : 'Employees'}
        description={`${hc.active} of ${hc.limit} seats used`}
        actions={
          can(actor, 'employee:create') && (
            <Button asChild disabled={hc.room <= 0}>
              <Link href="/employees/new">Add employee</Link>
            </Button>
          )
        }
      />

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-5">
        <Input name="q" defaultValue={q} placeholder="Search name or code" className="sm:col-span-2" />
        {!isManager && (
          <>
            <NativeSelect name="branch" defaultValue={sp.branch ?? ''} aria-label="Branch">
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="dept" defaultValue={sp.dept ?? ''} aria-label="Department">
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </>
        )}
        <div className="flex gap-2">
          <NativeSelect name="status" defaultValue={sp.status ?? 'ACTIVE'} aria-label="Status">
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All</option>
          </NativeSelect>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </div>
      </form>

      <Card>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No one matches. {can(actor, 'employee:create') && 'Add your first employee to get started.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Works at</th>
                    <th className="px-4 py-3">Reports to</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {employees.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/employees/${e.id}`} className="font-medium text-blue-700 hover:underline">
                          {e.name}
                        </Link>
                        {e.status === 'INACTIVE' && (
                          <Badge variant="secondary" className="ml-2">
                            Inactive
                          </Badge>
                        )}
                        {e.designation && <p className="text-xs text-gray-500">{e.designation}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{e.code}</td>
                      <td className="px-4 py-3 text-gray-600">{e.branch?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{e.department?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{WORK_TYPE_LABEL[e.workType]}</td>
                      <td className="px-4 py-3 text-gray-600">{e.manager?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
