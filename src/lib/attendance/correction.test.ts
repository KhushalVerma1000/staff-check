import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCorrection } from './correction';

const base = { dayKey: '2026-10-30', todayKey: '2026-11-03', status: 'PRESENT' as const, tz: 'Asia/Kolkata' };

test('accepts a recent day with ordered times', () => {
  const r = validateCorrection({ ...base, checkIn: '09:30', checkOut: '18:00' });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.checkIn?.toISOString(), '2026-10-30T04:00:00.000Z');
    assert.equal(r.checkOut?.toISOString(), '2026-10-30T12:30:00.000Z');
  }
});

test('rejects future, too-old, and malformed days', () => {
  assert.equal(validateCorrection({ ...base, dayKey: '2026-11-04' }).ok, false);
  assert.equal(validateCorrection({ ...base, dayKey: '2026-09-01' }).ok, false);
  assert.equal(validateCorrection({ ...base, dayKey: 'nope' }).ok, false);
  assert.equal(validateCorrection({ ...base, dayKey: '2026-11-03' }).ok, true); // today is fine
  assert.equal(validateCorrection({ ...base, dayKey: '2026-10-03' }).ok, true); // exactly 31 days
  assert.equal(validateCorrection({ ...base, dayKey: '2026-10-02' }).ok, false);
});

test('times: only on worked days, in order, well formed', () => {
  assert.equal(validateCorrection({ ...base, status: 'ABSENT', checkIn: '09:00' }).ok, false);
  assert.equal(validateCorrection({ ...base, checkIn: '18:00', checkOut: '09:00' }).ok, false);
  assert.equal(validateCorrection({ ...base, checkIn: '9.30' }).ok, false);
  assert.equal(validateCorrection({ ...base, status: 'HALF_DAY' }).ok, true);
});
