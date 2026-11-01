import { and, asc, gte, isNull, lte, or } from 'drizzle-orm';
import { db, attendanceRecord, employee } from '@/db';
import { monthRange, summarize, workingDaysBetween, type AttendanceSummary } from '@/lib/attendance/summary';
import type { Actor } from '@/lib/auth/can';
import { employeeFilter } from '@/lib/tenant/sql';

export interface ReportRow extends AttendanceSummary {
  employeeId: string;
  code: string;
  name: string;
  branch: string | null;
  department: string | null;
  designation: string | null;
}

export interface MonthlyReport {
  month: string;
  workingDays: number;
  rows: ReportRow[];
}

/** Attendance roll-up for one month, limited to the people the actor may see. */
export async function loadMonthlyReport(actor: Actor, month: string): Promise<MonthlyReport> {
  const { from, to } = monthRange(month);
  const workingDays = workingDaysBetween(from, to);

  const employees = await db.query.employee.findMany({
    where: and(
      employeeFilter(actor),
      lte(employee.joinedOn, to),
      or(isNull(employee.exitedOn), gte(employee.exitedOn, from)),
    ),
    orderBy: asc(employee.name),
    with: {
      branch: { columns: { name: true } },
      department: { columns: { name: true } },
      attendance: {
        where: and(gte(attendanceRecord.date, from), lte(attendanceRecord.date, to)),
        columns: { status: true },
      },
    },
  });

  return {
    month,
    workingDays,
    rows: employees.map((e) => ({
      employeeId: e.id,
      code: e.code,
      name: e.name,
      branch: e.branch?.name ?? null,
      department: e.department?.name ?? null,
      designation: e.designation,
      ...summarize(e.attendance, workingDays),
    })),
  };
}

export function isMonthKey(s: string | undefined): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
