import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { db, payrollRun, payslip } from '@/db';
import { formatINR } from '@/lib/payroll/money';
import { requireCompanyActor } from '@/lib/session';

export const metadata = { title: 'My payslips' };

export default async function MyPayslipsPage() {
  const actor = await requireCompanyActor();
  const rows = actor.employeeId
    ? await db
        .select({ id: payslip.id, month: payrollRun.month, net: payslip.netPaise })
        .from(payslip)
        .innerJoin(payrollRun, eq(payrollRun.id, payslip.runId))
        .where(and(eq(payslip.employeeId, actor.employeeId), eq(payslip.companyId, actor.companyId), eq(payrollRun.status, 'FINALIZED')))
        .orderBy(desc(payrollRun.month))
    : [];

  return (
    <>
      <PageHeader title="My payslips" description="Shown once payroll for the month is finalized." />
      <Card className="max-w-xl">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">{actor.employeeId ? 'No payslips yet.' : 'Your login is not linked to a staff record, so there are no payslips to show.'}</p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/payroll/slip/${r.id}`} className="flex items-center justify-between p-4 hover:bg-gray-50">
                    <span className="font-medium">{r.month}</span>
                    <span className="tabular-nums text-gray-700">{formatINR(r.net)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
