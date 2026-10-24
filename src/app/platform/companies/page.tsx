import Link from 'next/link';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { effectiveLimit } from '@/lib/tenant/headcount';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/session';

export const metadata = { title: 'Companies' };

const STATUS_VARIANT = { TRIAL: 'outline', ACTIVE: 'default', SUSPENDED: 'destructive' } as const;

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSuperAdmin();
  const { q } = await searchParams;
  const term = q?.trim();

  const [companies, counts] = await Promise.all([
    prisma.company.findMany({
      where: term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { slug: { contains: term, mode: 'insensitive' } }] } : {},
      orderBy: { createdAt: 'desc' },
    }),
    prisma.employee.groupBy({ by: ['companyId'], where: { status: 'ACTIVE' }, _count: { _all: true } }),
  ]);
  const active = new Map(counts.map((c) => [c.companyId, c._count._all]));

  return (
    <>
      <PageHeader
        title="Client companies"
        description={`${companies.length} ${companies.length === 1 ? 'company' : 'companies'}`}
        actions={
          <Button asChild>
            <Link href="/platform/companies/new">Add company</Link>
          </Button>
        }
      />
      <form method="get" className="mb-4 flex max-w-md gap-2">
        <Input name="q" defaultValue={term} placeholder="Search by name or handle" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <Card>
        <CardContent className="p-0">
          {companies.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No companies yet. Add your first client.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3 text-right">Seats used</th>
                    <th className="px-4 py-3">Trial ends</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {companies.map((c) => {
                    const used = active.get(c.id) ?? 0;
                    const limit = effectiveLimit(c.employeeLimit);
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link href={`/platform/companies/${c.id}`} className="font-medium text-blue-700 hover:underline">
                            {c.name}
                          </Link>
                          <p className="text-xs text-gray-500">{c.slug}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[c.status]}>{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{c.plan.charAt(0) + c.plan.slice(1).toLowerCase()}</td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {used} / {limit}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{c.trialEndsAt ? c.trialEndsAt.toLocaleDateString('en-GB') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
