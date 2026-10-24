import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthRange, parseDay, summarize, toDayKey, workingDaysBetween } from './summary';

test('summarize counts statuses and payable days', () => {
  const s = summarize(
    [{ status: 'PRESENT' }, { status: 'PRESENT' }, { status: 'HALF_DAY' }, { status: 'ABSENT' }, { status: 'ON_LEAVE' }],
    26,
  );
  assert.deepEqual(s, { present: 2, halfDay: 1, absent: 1, onLeave: 1, payableDays: 3.5, unmarked: 21 });
});

test('unmarked never goes negative', () => {
  assert.equal(summarize([{ status: 'PRESENT' }, { status: 'PRESENT' }], 1).unmarked, 0);
});

test('workingDaysBetween skips Sundays', () => {
  // Mon 2026-10-05 .. Sun 2026-10-11 = 6 working days
  assert.equal(workingDaysBetween(parseDay('2026-10-05')!, parseDay('2026-10-11')!), 6);
  assert.equal(workingDaysBetween(parseDay('2026-10-11')!, parseDay('2026-10-11')!), 0);
  assert.equal(workingDaysBetween(parseDay('2026-10-12')!, parseDay('2026-10-05')!), 0);
});

test('October 2026 has 27 Mon–Sat days', () => {
  const { from, to } = monthRange('2026-10');
  assert.equal(toDayKey(from), '2026-10-01');
  assert.equal(toDayKey(to), '2026-10-31');
  assert.equal(workingDaysBetween(from, to), 27);
});

test('monthRange handles February in a leap year and rejects junk', () => {
  assert.equal(toDayKey(monthRange('2028-02').to), '2028-02-29');
  assert.throws(() => monthRange('2026-13'));
  assert.throws(() => monthRange('oct'));
});

test('parseDay rejects impossible dates', () => {
  assert.equal(parseDay('2026-02-30'), null);
  assert.equal(parseDay('26-02-01'), null);
  assert.equal(toDayKey(parseDay('2026-10-18')!), '2026-10-18');
});
