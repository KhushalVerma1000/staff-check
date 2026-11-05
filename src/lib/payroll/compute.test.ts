import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePay, prorate } from './compute';
import { paidDaysFor } from './days';
import { formatINR, parseRupees, toRupees } from './money';

const off = { pf: false, esic: false, professionalTax: 0 };

test('hand-checked sample: full month, PF + ESIC off', () => {
  // basic 20,000 + hra 8,000 + other 2,000 = 30,000 for 26 of 26 days
  const p = computePay({ structure: { basic: 20_000_00, hra: 8_000_00, other: 2_000_00 }, settings: off, workingDays: 26, paidDays: 26 });
  assert.deepEqual(p, { basic: 20_000_00, hra: 8_000_00, other: 2_000_00, gross: 30_000_00, pf: 0, esic: 0, pt: 0, deductions: 0, net: 30_000_00 });
});

test('hand-checked sample: 24 of 26 days, PF capped at the ₹15,000 wage ceiling, professional tax ₹200', () => {
  // basic earned = 20000*24/26 = 18461.54 ; hra = 8000*24/26 = 7384.62 ; other = 2000*24/26 = 1846.15
  const p = computePay({
    structure: { basic: 20_000_00, hra: 8_000_00, other: 2_000_00 },
    settings: { pf: true, esic: true, professionalTax: 200_00 },
    workingDays: 26,
    paidDays: 24,
  });
  assert.equal(p.basic, 1_846_154);
  assert.equal(p.hra, 738_462);
  assert.equal(p.other, 184_615);
  assert.equal(p.gross, 2_769_231);
  assert.equal(p.pf, 180_000); // 12% of the ₹15,000 ceiling = ₹1,800.00
  assert.equal(p.esic, 0); // monthly gross ₹30,000 is above the ₹21,000 limit
  assert.equal(p.pt, 20_000);
  assert.equal(p.deductions, 200_000);
  assert.equal(p.net, 2_569_231);
});

test('ESIC applies at or below ₹21,000 and rounds up to the next rupee', () => {
  // gross 20,000 over 26 days, paid 25 → 19230.77 ; 0.75% = 144.23 → ₹145
  const p = computePay({ structure: { basic: 12_000_00, hra: 6_000_00, other: 2_000_00 }, settings: { pf: false, esic: true, professionalTax: 0 }, workingDays: 26, paidDays: 25 });
  assert.equal(p.gross, 1_923_077);
  assert.equal(p.esic, 14_500);
  const exact = computePay({ structure: { basic: 20_000_00, hra: 0, other: 0 }, settings: { pf: false, esic: true, professionalTax: 0 }, workingDays: 25, paidDays: 25 });
  assert.equal(exact.esic, 15_000); // 0.75% of 20,000 = 150.00 exactly, no extra rupee
  const above = computePay({ structure: { basic: 21_000_01, hra: 0, other: 0 }, settings: { pf: false, esic: true, professionalTax: 0 }, workingDays: 1, paidDays: 1 });
  assert.equal(above.esic, 0);
});

test('PF follows earned basic below the ceiling', () => {
  const p = computePay({ structure: { basic: 10_000_00, hra: 0, other: 0 }, settings: { pf: true, esic: false, professionalTax: 0 }, workingDays: 26, paidDays: 13 });
  assert.equal(p.basic, 5_000_00);
  assert.equal(p.pf, 60_000); // 12% of 5,000
});

test('half days prorate exactly and paid days are clamped', () => {
  assert.equal(prorate(26_000_00, 12.5, 26), 12_500_00);
  assert.equal(prorate(100, 40, 26), 100);
  assert.equal(prorate(100, -3, 26), 0);
  assert.equal(prorate(0, 5, 26), 0);
});

test('nobody earns, nothing is deducted, and deductions never push net below zero', () => {
  const none = computePay({ structure: { basic: 10_000_00, hra: 0, other: 0 }, settings: { pf: true, esic: true, professionalTax: 200_00 }, workingDays: 26, paidDays: 0 });
  assert.deepEqual([none.gross, none.deductions, none.net], [0, 0, 0]);
  const tiny = computePay({ structure: { basic: 100_00, hra: 0, other: 0 }, settings: { pf: true, esic: false, professionalTax: 500_00 }, workingDays: 26, paidDays: 26 });
  assert.equal(tiny.net, 0);
  assert.equal(tiny.deductions, tiny.gross);
  assert.equal(tiny.pf + tiny.esic + tiny.pt, tiny.deductions);
});

test('paid days: present, half, leave count; absent and Sundays do not; unmarked days are flagged', () => {
  // Nov 2026: Nov 1 is a Sunday. Mon–Sat days = 25.
  const d = (day: number) => new Date(Date.UTC(2026, 10, day));
  const r = paidDaysFor('2026-11', [
    { date: d(2), status: 'PRESENT' },
    { date: d(3), status: 'HALF_DAY' },
    { date: d(4), status: 'ON_LEAVE' },
    { date: d(5), status: 'ABSENT' },
    { date: d(8), status: 'PRESENT' }, // Sunday: ignored
  ], new Date(Date.UTC(2026, 0, 1)), null);
  assert.equal(r.workingDays, 25);
  assert.equal(r.paidDays, 2.5);
  assert.equal(r.unmarkedDays, 21);
});

test('joiners and leavers are only owed for the days they were employed', () => {
  const d = (day: number) => new Date(Date.UTC(2026, 10, day));
  const joined = paidDaysFor('2026-11', [{ date: d(16), status: 'PRESENT' }, { date: d(2), status: 'PRESENT' }], d(16), null);
  assert.equal(joined.workingDays, 25);
  assert.equal(joined.paidDays, 1); // the record before joining is ignored
  assert.equal(joined.unmarkedDays, 12); // Nov 16–30 has 13 Mon–Sat days (Sundays 22 and 29 are off), one is marked
});

test('money parsing and display', () => {
  assert.equal(parseRupees('45,000.5'), 4_500_050);
  assert.equal(parseRupees('₹ 1200'), 120_000);
  assert.equal(parseRupees('12.345'), null);
  assert.equal(parseRupees('-5'), null);
  assert.equal(parseRupees(''), null);
  assert.equal(parseRupees('1e5'), null);
  assert.equal(formatINR(123_456_789), '₹12,34,567.89');
  assert.equal(formatINR(5), '₹0.05');
  assert.equal(toRupees(1_923_077), 19_230.77);
});
