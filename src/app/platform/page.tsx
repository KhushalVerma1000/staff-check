import Link from 'next/link';
import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { asc, count, desc, eq, and, lte } from 'drizzle-orm';
import { db, company, employee } from '@/db';
import { requireSuperAdmin } from '@/lib/session';

export const metadata = { title: 'Platform overview' };

export default async function PlatformHome() {
  await requireSuperAdmin();
  const soon = new Date(Date.now() + 7 * 86_400_000);

  const [byStatus, employees, endingTrials, recent] = await Promise.all([
    db.select({ status: company.status, n: count() }).from(company).groupBy(company.status),
    db.select({ n: count() }).from(employee).where(eq(employee.status, 'ACTIVE')).then((r) => r[0].n),
    db
      .select({ id: company.id, name: company.name, trialEndsAt: company.trialEndsAt })
      .from(company)
      .where(and(eq(company.status, 'TRIAL'), lte(company.trialEndsAt, soon)))
      .orderBy(asc(company.trialEndsAt))
      .limit(10),
    db
      .select({ id: company.id, name: company.name, createdAt: company.createdAt, plan: company.plan })
      .from(company)
      .orderBy(desc(company.createdAt))
      .limit(5),
  ]);
  const n = (s: string) => byStatus.find((b) => b.status === s)?.n ?? 0;

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
