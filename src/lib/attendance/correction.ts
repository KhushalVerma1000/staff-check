import { zonedTimeToUtc } from '@/lib/tenant/time';

export const MAX_BACKDATE_DAYS = 31;
export type CorrectionStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE';

export interface CorrectionInput {
  dayKey: string;
  todayKey: string;
  status: CorrectionStatus;
  checkIn?: string; // "HH:MM" in the company timezone
  checkOut?: string;
  tz: string;
}

export type CorrectionResult =
  | { ok: true; checkIn: Date | null; checkOut: Date | null }
  | { ok: false; error: string };

const dayNumber = (k: string) => Math.floor(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86_400_000);

/**
 * Validate an attendance correction request. The day must be a real past (or
 * today) date within the back-dating window; times only apply to worked days
 * and must be in order.
 */
export function validateCorrection(i: CorrectionInput): CorrectionResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.dayKey) || Number.isNaN(Date.parse(i.dayKey))) return { ok: false, error: 'Pick a valid date.' };
  const age = dayNumber(i.todayKey) - dayNumber(i.dayKey);
  if (age < 0) return { ok: false, error: 'You cannot correct a future date.' };
  if (age > MAX_BACKDATE_DAYS) return { ok: false, error: `Corrections can go back ${MAX_BACKDATE_DAYS} days. Ask HR for older dates.` };

  const worked = i.status === 'PRESENT' || i.status === 'HALF_DAY';
  if (!worked && (i.checkIn || i.checkOut)) return { ok: false, error: 'Times only apply to a present or half day.' };
  const inAt = i.checkIn ? zonedTimeToUtc(i.dayKey, i.checkIn, i.tz) : null;
  const outAt = i.checkOut ? zonedTimeToUtc(i.dayKey, i.checkOut, i.tz) : null;
  if ((i.checkIn && !inAt) || (i.checkOut && !outAt)) return { ok: false, error: 'Enter times like 09:30.' };
  if (inAt && outAt && outAt <= inAt) return { ok: false, error: 'Check-out must be after check-in.' };
  return { ok: true, checkIn: inAt, checkOut: outAt };
}
