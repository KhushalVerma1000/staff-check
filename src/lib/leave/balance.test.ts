import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowances, balance, DEFAULT_ALLOWANCE, fits, yearBounds } from './balance';

test('company policy rows override the defaults, other types keep them', () => {
  const a = allowances([{ type: 'CASUAL', annualDays: 8 }, { type: 'PAID', annualDays: null }]);
  assert.equal(a.CASUAL, 8);
  assert.equal(a.PAID, null);
  assert.equal(a.SICK, DEFAULT_ALLOWANCE.SICK);
});

test('remaining counts approved and pending days and never goes negative', () => {
  assert.deepEqual(balance(12, 5, 2), { allowance: 12, used: 5, pending: 2, remaining: 5 });
  assert.equal(balance(12, 10, 4).remaining, 0);
  assert.equal(balance(null, 40, 3).remaining, null);
});

test('fits allows exactly the remaining days, half days included', () => {
  const b = balance(12, 11, 0);
  assert.equal(fits(b, 1), true);
  assert.equal(fits(b, 1.5), false);
  assert.equal(fits(balance(12, 11.5, 0), 0.5), true);
  assert.equal(fits(balance(null, 999, 0), 30), true);
});

test('yearBounds spans 1 Jan to 31 Dec', () => {
  const { from, to } = yearBounds(2026);
  assert.equal(from.toISOString().slice(0, 10), '2026-01-01');
  assert.equal(to.toISOString().slice(0, 10), '2026-12-31');
});
