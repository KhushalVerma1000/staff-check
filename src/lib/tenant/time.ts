/** Today's calendar day ("YYYY-MM-DD") in an IANA timezone. */
export function todayKey(tz: string, now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** "YYYY-MM" of a day key. */
export function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}
