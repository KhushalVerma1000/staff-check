import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { ActionForm } from '@/components/action-form';
import { PageHeader } from '@/components/shell/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db, payrollRun, payslip } from '@/db';
import { can } from '@/lib/auth/can';
import { formatINR } from '@/lib/payroll/money';
import { buildRunLines } from '@/lib/payroll/run';
import { isMonthKey } from '@/lib/reports';
import { requireCompanyActor } from '@/lib/session';
import { deleteDraftRunAction, finalizeRunAction, recalcRunAction } from '../actions';

export const metadata = { title: 'Payroll run' };

export default async function RunPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!isMonthKey(month)) notFound();
  const actor = await requireCompanyActor('payroll:view');
  const manage = can(actor, 'payroll:manage', { companyId: actor.companyId });

  const [run] = await db.select().from(payrollRun).where(and(eq(payrollRun.companyId, actor.companyId), eq(payrollRun.month, month))).limit(1);
  if (!run) notFound();
  const lines = await db.select().from(payslip).where(eq(payslip.runId, run.id)).orderBy(asc(payslip.employeeCode));
  const draft = run.status === 'DRAFT';
  const withoutSalary = draft ? (await buildRunLines(actor.companyId, month)).withoutSalary : [];

  const total = (pick: (l: (typeof lines)[number]) => number) => lines.reduce((a, l) => a + pick(l), 0);
  const unmarked = total((l) => l.unmarkedDays);

  return (
    <>
      <PageHeader
        title={`Payroll ${month}`}
        description={draft ? 'Draft: recalculate after changing attendance or salaries. Nothing is final until you finalize.' : 'Finalized and locked.'}
        actions={
          <div className="flex items-center gap-3">
            <Badge variant={draft ? 'secondary' : 'default'}>{draft ? 'Draft' : 'Finalized'}</Badge>
            {!draft && manage && (
              <Button asChild variant="outline" size="sm">
                <a href={`/payroll/${month}/payout`}>Download payout sheet</a>
              </Button>
            )}
          </div>
        }
      />

      {withoutSalary.length > 0 && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Not in this run, no salary set: {withoutSalary.map((p) => `${p.name} (${p.code})`).join(', ')}.{' '}
          {manage && (
            <Link href="/payroll/salary" className="underline">
              Set salaries
            </Link>
          )}
        </p>
      )}
      {draft && unmarked > 0 && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {unmarked} working days have no attendance. They are paid as absent until marked; mark them, then recalculate.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Paid / working days</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">PF</TableHead>
                <TableHead className="text-right">ESIC</TableHead>
                <TableHead className="text-right">Prof. tax</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <p className="font-medium">{l.employeeName}</p>
                    <p className="text-xs text-gray-500">
                      {l.employeeCode}
                      {l.unmarkedDays > 0 ? ` · ${l.unmarkedDays} unmarked` : ''}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.paidDays} / {l.workingDays}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(l.grossPaise)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(l.pfPaise)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(l.esicPaise)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(l.ptPaise)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatINR(l.netPaise)}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/payroll/slip/${l.id}`} className="text-sm text-blue-700 hover:underline">
                      Payslip
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-gray-50 font-semibold">
                <TableCell>Total ({lines.length})</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">{formatINR(total((l) => l.grossPaise))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(total((l) => l.pfPaise))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(total((l) => l.esicPaise))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(total((l) => l.ptPaise))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(total((l) => l.netPaise))}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {draft && manage && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-base font-semibold">Finalize</h2>
              <p className="text-sm text-gray-600">Locks this run and its payslips. Employees can then see their payslips.</p>
              <ActionForm action={finalizeRunAction} submitLabel="Finalize payroll">
                <input type="hidden" name="id" value={run.id} />
                {unmarked > 0 && (
                  <label className="flex items-start gap-2 text-sm text-gray-800">
                    <input type="checkbox" name="acknowledge" className="mt-1 h-4 w-4" />
                    Finalize even though {unmarked} working days have no attendance (paid as absent).
                  </label>
                )}
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-base font-semibold">Change or discard</h2>
              <form action={recalcRunAction}>
                <input type="hidden" name="id" value={run.id} />
                <Button type="submit" variant="outline">
                  Recalculate from latest attendance and salaries
                </Button>
              </form>
              <form action={deleteDraftRunAction}>
                <input type="hidden" name="id" value={run.id} />
                <Button type="submit" variant="ghost" className="text-red-700">
                  Delete this draft
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
