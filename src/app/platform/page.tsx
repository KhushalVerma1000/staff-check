import Link from 'next/link';
import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/session';

export const metadata = { title: 'Platform overview' };

export default async function PlatformHome() {
  await requireSuperAdmin();
  const soon = new Date(Date.now() + 7 * 86_400_000);

  const [byStatus, employees, endingTrials, recent] = await Promise.all([
    prisma.company.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.employee.count({ where: { status: 'ACTIVE' } }),
    prisma.company.findMany({
      where: { status: 'TRIAL', trialEndsAt: { lte: soon } },
      orderBy: { trialEndsAt: 'asc' },
      select: { id: true, name: true, trialEndsAt: true },
      take: 10,
    }),
    prisma.company.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, createdAt: true, plan: true } }),
  ]);
  const n = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="All client companies at a glance."
        actions={
          <Button asChild>
            <Link href="/platform/companies/new">Add company</Link>
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active companies" value={n('ACTIVE')} />
        <Stat label="On trial" value={n('TRIAL')} />
        <Stat label="Suspended" value={n('SUSPENDED')} />
        <Stat label="Active employees (all)" value={employees} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trials ending within 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            {endingTrials.length === 0 ? (
              <p className="text-sm text-gray-500">None.</p>
            ) : (
              <ul className="divide-y text-sm">
                {endingTrials.map((c) => (
                  <li key={c.id} className="flex justify-between py-2">
                    <Link href={`/platform/companies/${c.id}`} className="text-blue-700 hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-gray-500">
                      {c.trialEndsAt && c.trialEndsAt < new Date() ? 'ended ' : 'ends '}
                      {c.trialEndsAt?.toLocaleDateString('en-GB')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Newest companies</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-gray-500">None yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {recent.map((c) => (
                  <li key={c.id} className="flex justify-between py-2">
                    <Link href={`/platform/companies/${c.id}`} className="text-blue-700 hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-gray-500">{c.createdAt.toLocaleDateString('en-GB')}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
}
