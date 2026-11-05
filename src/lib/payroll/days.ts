import { monthRange, toDayKey, workingDaysBetween, type DayStatus } from '@/lib/attendance/summary';

export interface DayRecord {
  date: Date;
  status: DayStatus;
}

export interface PaidDays {
  /** Mon–Sat days in the whole month: the divisor for pay. */
  workingDays: number;
  /** Days to pay for: present 1, half day 0.5, on leave 1 (unpaid leave is recorded as absent). */
  paidDays: number;
  /** Working days while employed that have no attendance record. They are not paid until marked. */
  unmarkedDays: number;
}

/**
 * Paid days for one person in one month. Only working days (Mon–Sat) between joining and exit count;
 * a record on a Sunday or outside employment is ignored, so paid days can never exceed working days.
 */
export function paidDaysFor(month: string, records: DayRecord[], joinedOn: Date, exitedOn: Date | null): PaidDays {
  const { from, to } = monthRange(month);
  const workingDays = workingDaysBetween(from, to);
  const start = joinedOn > from ? joinedOn : from;
  const end = exitedOn && exitedOn < to ? exitedOn : to;
  const eligible = workingDaysBetween(start, end);

  const seen = new Map<string, DayStatus>();
  for (const r of records) {
    const key = toDayKey(r.date);
    if (r.date < start || r.date > end || r.date.getUTCDay() === 0) continue;
    seen.set(key, r.status);
  }
  let paid = 0;
  for (const st of seen.values()) paid += st === 'PRESENT' || st === 'ON_LEAVE' ? 1 : st === 'HALF_DAY' ? 0.5 : 0;
  return { workingDays, paidDays: paid, unmarkedDays: Math.max(0, eligible - seen.size) };
}
