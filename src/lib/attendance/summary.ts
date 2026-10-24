export type DayStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE';

export interface SummaryInput {
  status: DayStatus;
}

export interface AttendanceSummary {
  present: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  /** Days worked, counting a half day as 0.5. */
  payableDays: number;
  /** Days with no record at all. */
  unmarked: number;
}

/**
 * Roll a month of attendance rows into counts. `expectedDays` is the number of
 * working days in the period (see `workingDaysBetween`).
 */
export function summarize(records: SummaryInput[], expectedDays: number): AttendanceSummary {
  let present = 0;
  let halfDay = 0;
  let absent = 0;
  let onLeave = 0;
  for (const r of records) {
    if (r.status === 'PRESENT') present++;
    else if (r.status === 'HALF_DAY') halfDay++;
    else if (r.status === 'ABSENT') absent++;
    else if (r.status === 'ON_LEAVE') onLeave++;
  }
  const marked = present + halfDay + absent + onLeave;
  return {
    present,
    halfDay,
    absent,
    onLeave,
    payableDays: present + halfDay * 0.5 + onLeave,
    unmarked: Math.max(0, expectedDays - marked),
  };
}

/** Mon–Sat working days from `from` to `to` inclusive (Sundays are off). Dates are treated as UTC calendar days. */
export function workingDaysBetween(from: Date, to: Date): number {
  if (to < from) return 0;
  let count = 0;
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (d.getTime() <= end) {
    if (d.getUTCDay() !== 0) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/** First and last calendar day (UTC) of a "YYYY-MM" month key. */
export function monthRange(key: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!m) throw new Error(`Invalid month "${key}", expected YYYY-MM`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return { from: new Date(Date.UTC(y, mo, 1)), to: new Date(Date.UTC(y, mo + 1, 0)) };
}

/** "YYYY-MM-DD" → Date at UTC midnight, or null when malformed. */
export function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s ? d : null;
}

export function toDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
