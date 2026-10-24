import { workingDaysBetween } from '@/lib/attendance/summary';

/** Working days a leave request covers (Sundays skipped). A half-day request counts 0.5 on a single day. */
export function leaveDays(from: Date, to: Date, halfDay = false): number {
  const days = workingDaysBetween(from, to);
  if (halfDay) return from.getTime() === to.getTime() && days === 1 ? 0.5 : days;
  return days;
}

/** Two inclusive date ranges overlap. */
export function overlaps(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}
