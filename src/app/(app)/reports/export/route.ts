import { NextResponse } from 'next/server';
import { can } from '@/lib/auth/can';
import { csvRow } from '@/lib/csv';
import { isMonthKey, loadMonthlyReport } from '@/lib/reports';
import { getActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor || !can(actor, 'reports:view', { companyId: actor.companyId })) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const month = new URL(req.url).searchParams.get('month') ?? undefined;
  if (!isMonthKey(month)) return new NextResponse('Use ?month=YYYY-MM', { status: 400 });

  const report = await loadMonthlyReport(actor, month);
  const lines = [
    csvRow(['Code', 'Name', 'Branch', 'Department', 'Designation', 'Working days', 'Present', 'Half day', 'On leave', 'Absent', 'Unmarked', 'Payable days']),
    ...report.rows.map((r) =>
      csvRow([r.code, r.name, r.branch, r.department, r.designation, report.workingDays, r.present, r.halfDay, r.onLeave, r.absent, r.unmarked, r.payableDays]),
    ),
  ];
  return new NextResponse(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="attendance-${month}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
