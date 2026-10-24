import type { Role } from '@prisma/client';

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  HR: 'HR',
  ACCOUNTANT: 'Accountant',
  MANAGER: 'Manager',
};

export const STATUS_LABEL = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HALF_DAY: 'Half day',
  ON_LEAVE: 'On leave',
} as const;

export const LEAVE_TYPE_LABEL = {
  CASUAL: 'Casual',
  SICK: 'Sick',
  PAID: 'Paid',
  UNPAID: 'Unpaid',
} as const;

export const WORK_TYPE_LABEL = { OFFICE: 'Office', FIELD: 'Field', HYBRID: 'Hybrid' } as const;

export const PLAN_LIMITS = {
  STARTER: 25,
  GROWTH: 50,
  BUSINESS: 100,
} as const;

/** The product is built for teams under 100 — the cap no plan may exceed. */
export const MAX_EMPLOYEES = 100;

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function fmtTime(d: Date | null | undefined, tz = 'Asia/Kolkata'): string {
  if (!d) return '—';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}
