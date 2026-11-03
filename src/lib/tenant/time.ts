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

/**
 * The UTC instant of a wall-clock time ("HH:MM") on a calendar day ("YYYY-MM-DD")
 * in an IANA timezone. Null when the inputs are malformed or the zone is unknown.
 * Works by measuring the zone's offset at that moment (no DST gap handling needed
 * for the zones this product targets; ambiguous hours resolve to the first).
 */
export function zonedTimeToUtc(dayKey: string, hhmm: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m || !t) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const offsetAt = (ms: number) => {
      const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms;
    };
    let ms = guess - offsetAt(guess);
    ms = guess - offsetAt(ms); // settle across a DST boundary
    return new Date(ms);
  } catch {
    return null;
  }
}
