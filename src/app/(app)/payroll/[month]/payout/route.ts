import { NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db, employeeKyc, payrollRun, payslip } from '@/db';
import { audit } from '@/lib/audit';
import { can } from '@/lib/auth/can';
import { decryptField } from '@/lib/crypto';
import { payableTotal, payoutRow, safeText, type PayoutKyc } from '@/lib/payroll/payout';
import { toRupees } from '@/lib/payroll/money';
import { isMonthKey } from '@/lib/reports';
import { getActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Bank upload sheet for a FINALIZED run. Contains full account numbers, so it needs payroll:manage and every download is audited. */
export async function GET(_req: Request, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const actor = await getActor();
  if (!actor?.companyId || !can(actor, 'payroll:manage', { companyId: actor.companyId })) return new NextResponse('Forbidden', { status: 403 });
  if (!isMonthKey(month)) return new NextResponse('Use /payroll/YYYY-MM/payout', { status: 400 });

  const [run] = await db.select().from(payrollRun).where(and(eq(payrollRun.companyId, actor.companyId), eq(payrollRun.month, month))).limit(1);
  if (!run) return new NextResponse('No payroll run for that month', { status: 404 });
  if (run.status !== 'FINALIZED') return new NextResponse('Finalize the run before downloading the payout sheet', { status: 409 });

  const slips = await db.select().from(payslip).where(eq(payslip.runId, run.id)).orderBy(asc(payslip.employeeCode));
  const kycRows = slips.length
    ? await db
        .select()
        .from(employeeKyc)
        .where(and(eq(employeeKyc.companyId, actor.companyId), inArray(employeeKyc.employeeId, slips.map((s) => s.employeeId))))
    : [];
  const kycBy = new Map<string, PayoutKyc>();
  for (const k of kycRows) {
    let account: string | null = null;
    try {
      account = k.accountEnc ? decryptField(k.accountEnc) : null;
    } catch {
      account = null; // unreadable value: shown as missing rather than failing the whole sheet
    }
    kycBy.set(k.employeeId, { status: k.status, bankHolder: k.bankHolder, bankName: k.bankName, account, ifsc: k.ifsc });
  }
  const rows = slips.map((s) => payoutRow({ code: s.employeeCode, name: s.employeeName, netPaise: s.netPaise }, kycBy.get(s.employeeId)));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Payout ${month}`);
  ws.columns = [
    { header: 'Employee code', key: 'code', width: 14 },
    { header: 'Name', key: 'name', width: 26 },
    { header: 'Account holder', key: 'holder', width: 26 },
    { header: 'Bank', key: 'bank', width: 22 },
    { header: 'Account number', key: 'account', width: 22, style: { numFmt: '@' } },
    { header: 'IFSC', key: 'ifsc', width: 14 },
    { header: 'Net payable (INR)', key: 'net', width: 18, style: { numFmt: '#,##0.00' } },
    { header: 'Check before paying', key: 'problem', width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) {
    const row = ws.addRow({
      code: safeText(r.code),
      name: safeText(r.name),
      holder: safeText(r.holder),
      bank: safeText(r.bank),
      account: r.account, // stays a string so long numbers are never shown in scientific notation
      ifsc: r.ifsc,
      net: toRupees(r.netPaise),
      problem: r.problem,
    });
    if (r.problem) row.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }));
  }
  const total = ws.addRow({ name: 'Total ready to pay', net: toRupees(payableTotal(rows)) });
  total.font = { bold: true };

  await audit({
    companyId: actor.companyId,
    userId: actor.id,
    action: 'payroll.payout.export',
    entity: 'PayrollRun',
    entityId: run.id,
    detail: `${month}: ${rows.filter((r) => !r.problem).length} ready, ${rows.filter((r) => r.problem).length} need attention`,
  });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="payout-${month}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
