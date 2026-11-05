import type { LeaveType } from '@/db/schema/app';

/**
 * Yearly allowance used when a company has not set its own policy row.
 * null = unlimited. These are starting points only; HR / admin edit them per company.
 */
export const DEFAULT_ALLOWANCE: Record<LeaveType, number | null> = {
  CASUAL: 12,
  SICK: 12,
  PAID: 15,
  UNPAID: null,
};

export const LEAVE_TYPES = ['CASUAL', 'SICK', 'PAID', 'UNPAID'] as const satisfies readonly LeaveType[];

/** Company policy rows layered over the defaults. */
export function allowances(rows: Array<{ type: LeaveType; annualDays: number | null }>): Record<LeaveType, number | null> {
  const out = { ...DEFAULT_ALLOWANCE };
  for (const r of rows) out[r.type] = r.annualDays;
  return out;
}

/** Calendar-year bounds (UTC dates, inclusive). A request counts toward the year its first day falls in. */
export function yearBounds(year: number): { from: Date; to: Date } {
  return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year, 11, 31)) };
}

export interface Balance {
  /** null = unlimited */
  allowance: number | null;
  used: number;
  pending: number;
  /** Days still free after approved and pending requests; null = unlimited. */
  remaining: number | null;
}

export function balance(allowance: number | null, used: number, pending: number): Balance {
  return {
    allowance,
    used,
    pending,
    remaining: allowance === null ? null : Math.max(0, round(allowance - used - pending)),
  };
}

/** Would `days` more fit inside the allowance, counting approved and pending days already taken? */
export function fits(b: Balance, days: number): boolean {
  return b.remaining === null || days <= b.remaining + 1e-9;
}

const round = (n: number) => Math.round(n * 100) / 100;
