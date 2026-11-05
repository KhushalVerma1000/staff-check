import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { PrintButton } from '@/components/print-button';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { company as companyTable, db, payrollRun, payslip } from '@/db';
import { can } from '@/lib/auth/can';
import { formatINR } from '@/lib/payroll/money';
import { requireCompanyActor } from '@/lib/session';

export const metadata = { title: 'Payslip' };

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireCompanyActor();

  const [row] = await db
    .select({ slip: payslip, month: payrollRun.month, status: payrollRun.status, company: companyTable.name })
    .from(payslip)
    .innerJoin(payrollRun, eq(payrollRun.id, payslip.runId))
    .innerJoin(companyTable, eq(companyTable.id, payslip.companyId))
    .where(and(eq(payslip.id, id), eq(payslip.companyId, actor.companyId)))
    .limit(1);
  if (!row) notFound();

  // Payroll staff see any payslip. Everyone else sees only their own, and only once the run is finalized.
  const staff = can(actor, 'payroll:view', { companyId: actor.companyId });
  const own = !!actor.employeeId && actor.employeeId === row.slip.employeeId && row.status === 'FINALIZED';
  if (!staff && !own) notFound();

  const s = row.slip;
  const earnings: Array<[string, number]> = [['Basic', s.basicPaise], ['HRA', s.hraPaise], ['Other allowances', s.otherPaise]];
  const deductions: Array<[string, number]> = [['Provident fund', s.pfPaise], ['ESIC', s.esicPaise], ['Professional tax', s.ptPaise]];

  return (
    <>
      <PageHeader title={`Payslip ${row.month}`} description={row.status === 'DRAFT' ? 'Draft: figures can still change.' : undefined} actions={<PrintButton />} />
      <Card className="max-w-2xl print:border-0 print:shadow-none">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap justify-between gap-3 border-b pb-4">
            <div>
              <p className="text-lg font-semibold text-gray-900">{s.employeeName}</p>
              <p className="text-sm text-gray-600">
                {s.employeeCode}
                {s.designation ? ` · ${s.designation}` : ''}
              </p>
            </div>
            <div className="text-right text-sm text-gray-600">
              <p className="font-medium text-gray-900">{row.company}</p>
              <p>Pay period {row.month}</p>
              <p>
                Paid days {s.paidDays} of {s.workingDays}
              </p>
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <section aria-label="Earnings">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Earnings</h2>
              <dl className="space-y-1 text-sm">
                {earnings.filter(([, v]) => v > 0).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt>{k}</dt>
                    <dd className="tabular-nums">{formatINR(v)}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1 font-medium">
                  <dt>Gross pay</dt>
                  <dd className="tabular-nums">{formatINR(s.grossPaise)}</dd>
                </div>
              </dl>
            </section>
            <section aria-label="Deductions">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Deductions</h2>
              <dl className="space-y-1 text-sm">
                {deductions.filter(([, v]) => v > 0).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt>{k}</dt>
                    <dd className="tabular-nums">{formatINR(v)}</dd>
                  </div>
                ))}
                {s.deductionsPaise === 0 && <p className="text-gray-500">None</p>}
                <div className="flex justify-between border-t pt-1 font-medium">
                  <dt>Total deductions</dt>
                  <dd className="tabular-nums">{formatINR(s.deductionsPaise)}</dd>
                </div>
              </dl>
            </section>
          </div>
          <div className="flex items-baseline justify-between rounded-lg bg-gray-50 px-4 py-3">
            <span className="font-semibold text-gray-900">Net pay</span>
            <span className="text-xl font-semibold tabular-nums">{formatINR(s.netPaise)}</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
