import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, Field } from '@/components/action-form';
import { CompanyFields } from '@/components/company-fields';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/session';
import { effectiveLimit } from '@/lib/tenant/headcount';
import { resetCompanyAdminAction, setCompanyStatusAction, updateCompanyAction } from '../actions';

export const metadata = { title: 'Company' };

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      users: { where: { role: 'ADMIN', deletedAt: null }, select: { id: true, name: true, email: true, lastLoginAt: true } },
      _count: { select: { branches: true, departments: true } },
    },
  });
  if (!company) notFound();

  const [active, inactive, lastActivity] = await Promise.all([
    prisma.employee.count({ where: { companyId: id, status: 'ACTIVE' } }),
    prisma.employee.count({ where: { companyId: id, status: 'INACTIVE' } }),
    prisma.auditLog.findFirst({ where: { companyId: id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  const limit = effectiveLimit(company.employeeLimit);

  return (
    <>
      <PageHeader
        title={company.name}
        description={`${company.slug} · created ${company.createdAt.toLocaleDateString('en-GB')}`}
        actions={<Badge variant={company.status === 'SUSPENDED' ? 'destructive' : company.status === 'ACTIVE' ? 'default' : 'outline'}>{company.status.toLowerCase()}</Badge>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Active employees" value={`${active} / ${limit}`} />
        <Stat label="Inactive" value={String(inactive)} />
        <Stat label="Branches" value={String(company._count.branches)} />
        <Stat label="Last activity" value={lastActivity ? lastActivity.createdAt.toLocaleDateString('en-GB') : '—'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan and details</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateCompanyAction} submitLabel="Save">
              <input type="hidden" name="id" value={company.id} />
              <CompanyFields
                defaults={{
                  name: company.name,
                  plan: company.plan,
                  employeeLimit: company.employeeLimit,
                  contactName: company.contactName,
                  contactEmail: company.contactEmail,
                  contactPhone: company.contactPhone,
                }}
              />
            </ActionForm>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Admin logins</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {company.users.length === 0 && <p className="text-sm text-gray-500">No active admin. Ask the company to restore one, or create a new company login.</p>}
              {company.users.map((u) => (
                <div key={u.id} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                  <p className="text-sm font-medium text-gray-900">{u.name}</p>
                  <p className="text-sm text-gray-500">
                    {u.email} · {u.lastLoginAt ? `last sign-in ${u.lastLoginAt.toLocaleDateString('en-GB')}` : 'never signed in'}
                  </p>
                  <ActionForm action={resetCompanyAdminAction} submitLabel="Reset password" variant="outline" className="space-y-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="companyId" value={company.id} />
                  </ActionForm>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{company.status === 'SUSPENDED' ? 'Suspended' : 'Suspend access'}</CardTitle>
            </CardHeader>
            <CardContent>
              {company.status === 'SUSPENDED' ? (
                <ActionForm action={setCompanyStatusAction} submitLabel="Reactivate company">
                  <input type="hidden" name="id" value={company.id} />
                  <input type="hidden" name="status" value="ACTIVE" />
                  <p className="text-sm text-gray-600">
                    Suspended {company.suspendedAt?.toLocaleDateString('en-GB')}
                    {company.suspendReason ? ` — ${company.suspendReason}` : ''}. Their data is kept.
                  </p>
                </ActionForm>
              ) : (
                <ActionForm action={setCompanyStatusAction} submitLabel="Suspend company" variant="destructive">
                  <input type="hidden" name="id" value={company.id} />
                  <input type="hidden" name="status" value="SUSPENDED" />
                  <p className="text-sm text-gray-600">Nobody at this company can sign in while suspended. Their data is kept.</p>
                  <Field label="Reason (optional)" htmlFor="reason">
                    <Input id="reason" name="reason" />
                  </Field>
                </ActionForm>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <p className="mt-6 text-sm">
        <Link href="/platform/companies" className="text-blue-700 hover:underline">
          ← All companies
        </Link>
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
}
