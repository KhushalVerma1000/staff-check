import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveDays, overlaps } from './days';
import { parseDay } from '@/lib/attendance/summary';

const d = (s: string) => parseDay(s)!;

test('leave across a Sunday skips it', () => {
  assert.equal(leaveDays(d('2026-10-09'), d('2026-10-13')), 4); // Fri Sat (Sun) Mon Tue
});

test('half day counts 0.5 only for a single working day', () => {
  assert.equal(leaveDays(d('2026-10-14'), d('2026-10-14'), true), 0.5);
  assert.equal(leaveDays(d('2026-10-14'), d('2026-10-15'), true), 2);
});

test('overlaps is inclusive at the edges', () => {
  assert.equal(overlaps(d('2026-10-01'), d('2026-10-05'), d('2026-10-05'), d('2026-10-08')), true);
  assert.equal(overlaps(d('2026-10-01'), d('2026-10-04'), d('2026-10-05'), d('2026-10-08')), false);
});
