import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { ActionForm, Field } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { db, company as companyTable, payrollRun, payslip } from '@/db';
import { can } from '@/lib/auth/can';
import { formatINR } from '@/lib/payroll/money';
import { requireCompanyActor } from '@/lib/session';
import { monthOf, todayKey } from '@/lib/tenant/time';
import { createRunAction } from './actions';

export const metadata = { title: 'Payroll' };

export default async function PayrollPage() {
  const actor = await requireCompanyActor('payroll:view');
  const manage = can(actor, 'payroll:manage', { companyId: actor.companyId });
  const [company] = await db.select({ timezone: companyTable.timezone }).from(companyTable).where(eq(companyTable.id, actor.companyId)).limit(1);
  const thisMonth = monthOf(todayKey(company?.timezone ?? 'UTC'));

  const runs = await db
    .select({
      id: payrollRun.id,
      month: payrollRun.month,
      status: payrollRun.status,
      people: sql<number>`count(${payslip.id})`.mapWith(Number),
      net: sql<number>`coalesce(sum(${payslip.netPaise}), 0)`.mapWith(Number),
    })
    .from(payrollRun)
    .leftJoin(payslip, eq(payslip.runId, payrollRun.id))
    .where(eq(payrollRun.companyId, actor.companyId))
    .groupBy(payrollRun.id)
    .orderBy(desc(payrollRun.month));

  return (
    <>
      <PageHeader
        title="Payroll"
        description="One run per month. Pay comes from attendance and each person's salary; a finalized run is locked."
        actions={
          manage ? (
            <div className="flex gap-3 text-sm">
              <Link className="text-blue-700 hover:underline" href="/payroll/salary">
                Salaries
              </Link>
              <Link className="text-blue-700 hover:underline" href="/payroll/settings">
                PF, ESIC and tax
              </Link>
            </div>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            {runs.length === 0 ? (
              <p className="p-6 text-sm text-gray-500">No payroll runs yet.{manage ? ' Start one for a month on the right.' : ''}</p>
            ) : (
              <ul className="divide-y">
                {runs.map((r) => (
                  <li key={r.id}>
                    <Link href={`/payroll/${r.month}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-gray-50">
                      <div>
                        <p className="font-medium text-gray-900">{r.month}</p>
                        <p className="text-sm text-gray-500">{r.people} {r.people === 1 ? 'person' : 'people'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium tabular-nums">{formatINR(r.net)}</span>
                        <Badge variant={r.status === 'FINALIZED' ? 'default' : 'secondary'}>{r.status === 'FINALIZED' ? 'Finalized' : 'Draft'}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {manage && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Start a run</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={createRunAction} submitLabel="Create draft">
                <Field label="Month" htmlFor="month" hint="This month or an earlier one.">
                  <Input id="month" name="month" type="month" max={thisMonth} defaultValue={thisMonth} required />
                </Field>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
