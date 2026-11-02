/** Format checks for onboarding fields. Each returns an error sentence or null. All inputs are trimmed first by callers. */

// Verhoeff checksum tables (used by Aadhaar).
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(digits: string): boolean {
  let c = 0;
  const rev = digits.split('').reverse();
  for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][Number(rev[i])]];
  return c === 0;
}

export const digitsOnly = (v: string) => v.replace(/[\s-]/g, '');

export function aadhaarError(v: string): string | null {
  const d = digitsOnly(v);
  if (!/^[2-9]\d{11}$/.test(d)) return 'Aadhaar should be 12 digits and not start with 0 or 1.';
  return verhoeffValid(d) ? null : 'That Aadhaar number does not pass the check digit. Re-check it.';
}
export const panError = (v: string) =>
  /^[A-Z]{5}\d{4}[A-Z]$/.test(v.toUpperCase()) ? null : 'PAN looks wrong. It should be 5 letters, 4 digits, then 1 letter, like ABCDE1234F.';
export const uanError = (v: string) => (/^\d{12}$/.test(digitsOnly(v)) ? null : 'UAN should be 12 digits.');
export const esicError = (v: string) => (/^\d{10,17}$/.test(digitsOnly(v)) ? null : 'ESIC IP number should be 10 to 17 digits.');
export const ifscError = (v: string) =>
  /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase()) ? null : 'IFSC should be 4 letters, a zero, then 6 letters or digits, like HDFC0001234.';
export const accountError = (v: string) => (/^\d{9,18}$/.test(digitsOnly(v)) ? null : 'Account number should be 9 to 18 digits.');
export const pincodeError = (v: string) => (/^[1-9]\d{5}$/.test(v) ? null : 'PIN code should be 6 digits.');

/** Show only the last 4 characters: "•••• 6620". */
export function maskTail(v: string | null | undefined): string {
  if (!v) return '—';
  const s = v.replace(/\s/g, '');
  return `•••• ${s.slice(-4)}`;
}

/** Canonical stored form: digits for numeric ids, upper case for PAN / IFSC. */
export const normalize = {
  digits: (v: string) => digitsOnly(v),
  upper: (v: string) => v.trim().toUpperCase(),
};
