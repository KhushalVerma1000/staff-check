import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { db as defaultDb, attendanceRecord, employee, payrollSettings, salaryStructure } from '@/db';
import { monthRange } from '@/lib/attendance/summary';
import { computePay, type PaySettings } from './compute';
import { paidDaysFor } from './days';

/** The app's database handle; tests pass an in-process Postgres instead. */
export type Db = typeof defaultDb;

export async function loadPaySettings(companyId: string, db: Db = defaultDb): Promise<PaySettings> {
  const [row] = await db.select().from(payrollSettings).where(eq(payrollSettings.companyId, companyId)).limit(1);
  return { pf: row?.pfEnabled ?? false, esic: row?.esicEnabled ?? false, professionalTax: row?.professionalTaxPaise ?? 0 };
}

export interface PayslipDraft {
  companyId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string | null;
  workingDays: number;
  paidDays: number;
  unmarkedDays: number;
  basicPaise: number;
  hraPaise: number;
  otherPaise: number;
  grossPaise: number;
  pfPaise: number;
  esicPaise: number;
  ptPaise: number;
  deductionsPaise: number;
  netPaise: number;
}

export interface BuiltRun {
  lines: PayslipDraft[];
  /** People employed this month who have no salary structure yet, so are not in the run. */
  withoutSalary: Array<{ id: string; code: string; name: string }>;
}

/**
 * Pay for everyone employed in `month` who has a salary structure, from approved attendance.
 * Pure read: the caller stores the lines (create or recalculate a DRAFT run).
 */
export async function buildRunLines(companyId: string, month: string, db: Db = defaultDb): Promise<BuiltRun> {
  const { from, to } = monthRange(month);
  const settings = await loadPaySettings(companyId, db);

  const people = await db
    .select({
      id: employee.id,
      code: employee.code,
      name: employee.name,
      designation: employee.designation,
      joinedOn: employee.joinedOn,
      exitedOn: employee.exitedOn,
      basic: salaryStructure.basicPaise,
      hra: salaryStructure.hraPaise,
      other: salaryStructure.otherPaise,
      hasSalary: salaryStructure.id,
    })
    .from(employee)
    .leftJoin(salaryStructure, eq(salaryStructure.employeeId, employee.id))
    .where(
      and(eq(employee.companyId, companyId), lte(employee.joinedOn, to), or(isNull(employee.exitedOn), gte(employee.exitedOn, from))),
    )
    .orderBy(employee.code);

  const paid = people.filter((p) => p.hasSalary !== null);
  const records = paid.length
    ? await db
        .select({ employeeId: attendanceRecord.employeeId, date: attendanceRecord.date, status: attendanceRecord.status })
        .from(attendanceRecord)
        .where(
          and(
            eq(attendanceRecord.companyId, companyId),
            inArray(attendanceRecord.employeeId, paid.map((p) => p.id)),
            gte(attendanceRecord.date, from),
            lte(attendanceRecord.date, to),
          ),
        )
    : [];
  const byPerson = new Map<string, Array<{ date: Date; status: (typeof records)[number]['status'] }>>();
  for (const r of records) (byPerson.get(r.employeeId) ?? byPerson.set(r.employeeId, []).get(r.employeeId)!).push(r);

  const lines: PayslipDraft[] = paid.map((p) => {
    const days = paidDaysFor(month, byPerson.get(p.id) ?? [], p.joinedOn, p.exitedOn);
    const pay = computePay({
      structure: { basic: p.basic ?? 0, hra: p.hra ?? 0, other: p.other ?? 0 },
      settings,
      workingDays: days.workingDays,
      paidDays: days.paidDays,
    });
    return {
      companyId,
      employeeId: p.id,
      employeeCode: p.code,
      employeeName: p.name,
      designation: p.designation,
      workingDays: days.workingDays,
      paidDays: days.paidDays,
      unmarkedDays: days.unmarkedDays,
      basicPaise: pay.basic,
      hraPaise: pay.hra,
      otherPaise: pay.other,
      grossPaise: pay.gross,
      pfPaise: pay.pf,
      esicPaise: pay.esic,
      ptPaise: pay.pt,
      deductionsPaise: pay.deductions,
      netPaise: pay.net,
    };
  });

  return { lines, withoutSalary: people.filter((p) => p.hasSalary === null).map((p) => ({ id: p.id, code: p.code, name: p.name })) };
}
