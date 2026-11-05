/** Money is whole paise (integers) everywhere. These are the only places rupees and paise convert. */

/** "45000", "45,000.5", "₹ 1,200.75" → paise, or null when it is not a valid non-negative amount with at most 2 decimals. */
export function parseRupees(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [r, p = ''] = s.split('.');
  const paise = Number(r) * 100 + Number(p.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise <= 100_000_000_00 ? paise : null; // up to ₹10 crore a month
}

/** 123456 → "₹1,234.56" (Indian digit grouping). */
export function formatINR(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}₹${rupees.toLocaleString('en-IN')}.${p}`;
}

/** Paise as a plain rupee number for spreadsheets (exact to 2 decimals). */
export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}
