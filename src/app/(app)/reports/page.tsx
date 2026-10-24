import Link from 'next/link';
import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { isMonthKey, loadMonthlyReport } from '@/lib/reports';
import { prisma } from '@/lib/prisma';
import { requireCompanyActor } from '@/lib/session';
import { monthOf, todayKey } from '@/lib/tenant/time';

export const metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireCompanyActor('reports:view');
  const sp = await searchParams;
  const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { timezone: true } });
  const month = isMonthKey(sp.month) ? sp.month : monthOf(todayKey(company?.timezone ?? 'UTC'));
  const report = await loadMonthlyReport(actor, month);

  return (
    <>
      <PageHeader
        title="Monthly attendance"
        description={`${report.workingDays} working days (Mon–Sat). Payable days count half days as 0.5 and paid leave as worked.`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/reports/export?month=${month}`} prefetch={false}>
              Download CSV
            </Link>
          </Button>
        }
      />
      <form method="get" className="mb-4 flex items-end gap-2">
        <div>
          <label htmlFor="month" className="mb-1 block text-xs text-gray-500">
            Month
          </label>
          <Input id="month" name="month" type="month" defaultValue={month} />
        </div>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>
      <Card>
        <CardContent className="p-0">
          {report.rows.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">No one was on the team in this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3 text-right">Present</th>
                    <th className="px-4 py-3 text-right">Half</th>
                    <th className="px-4 py-3 text-right">Leave</th>
                    <th className="px-4 py-3 text-right">Absent</th>
                    <th className="px-4 py-3 text-right">Unmarked</th>
                    <th className="px-4 py-3 text-right">Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.rows.map((r) => (
                    <tr key={r.employeeId}>
                      <td className="px-4 py-2">
                        <p className="font-medium text-gray-900">{r.name}</p>
                        <p className="text-xs text-gray-500">{r.code}</p>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{r.branch ?? '—'}</td>
                      <td className="px-4 py-2 text-right">{r.present}</td>
                      <td className="px-4 py-2 text-right">{r.halfDay}</td>
                      <td className="px-4 py-2 text-right">{r.onLeave}</td>
                      <td className="px-4 py-2 text-right">{r.absent}</td>
                      <td className="px-4 py-2 text-right text-amber-700">{r.unmarked}</td>
                      <td className="px-4 py-2 text-right font-medium">{r.payableDays}</td>
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
