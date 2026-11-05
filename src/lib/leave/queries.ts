import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db, leavePolicy, leaveRequest } from '@/db';
import type { LeaveType } from '@/db/schema/app';
import { allowances, balance, LEAVE_TYPES, yearBounds, type Balance } from './balance';

/** The company's yearly allowance per leave type (its policy rows over the defaults). */
export async function companyAllowances(companyId: string): Promise<Record<LeaveType, number | null>> {
  const rows = await db.select({ type: leavePolicy.type, annualDays: leavePolicy.annualDays }).from(leavePolicy).where(eq(leavePolicy.companyId, companyId));
  return allowances(rows);
}

/** One employee's balance per leave type for a calendar year (requests count toward the year they start in). */
export async function employeeBalances(companyId: string, employeeId: string, year: number): Promise<Record<LeaveType, Balance>> {
  const { from, to } = yearBounds(year);
  const [allowance, rows] = await Promise.all([
    companyAllowances(companyId),
    db
      .select({ type: leaveRequest.type, status: leaveRequest.status, days: sql<number>`coalesce(sum(${leaveRequest.days}), 0)`.mapWith(Number) })
      .from(leaveRequest)
      .where(
        and(
          eq(leaveRequest.companyId, companyId),
          eq(leaveRequest.employeeId, employeeId),
          gte(leaveRequest.fromDate, from),
          lte(leaveRequest.fromDate, to),
        ),
      )
      .groupBy(leaveRequest.type, leaveRequest.status),
  ]);
  const used = (t: LeaveType, s: string) => rows.find((r) => r.type === t && r.status === s)?.days ?? 0;
  return Object.fromEntries(LEAVE_TYPES.map((t) => [t, balance(allowance[t], used(t, 'APPROVED'), used(t, 'PENDING'))])) as Record<LeaveType, Balance>;
}
