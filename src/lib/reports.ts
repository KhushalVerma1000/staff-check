import { monthRange, summarize, workingDaysBetween, type AttendanceSummary } from '@/lib/attendance/summary';
import type { Actor } from '@/lib/auth/can';
import { prisma } from '@/lib/prisma';
import { employeeScope } from '@/lib/tenant/scope';

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

  const employees = await prisma.employee.findMany({
    where: {
      AND: [
        employeeScope(actor),
        { joinedOn: { lte: to }, OR: [{ exitedOn: null }, { exitedOn: { gte: from } }] },
      ],
    },
    orderBy: { name: 'asc' },
    include: {
      branch: { select: { name: true } },
      department: { select: { name: true } },
      attendance: { where: { date: { gte: from, lte: to } }, select: { status: true } },
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
