import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthOf, todayKey } from './time';

test('todayKey follows the company timezone, not the server', () => {
  const instant = new Date('2026-10-18T20:00:00Z'); // 01:30 on 19 Oct in Kolkata
  assert.equal(todayKey('Asia/Kolkata', instant), '2026-10-19');
  assert.equal(todayKey('UTC', instant), '2026-10-18');
  assert.equal(todayKey('America/Los_Angeles', instant), '2026-10-18');
});

test('an invalid timezone falls back to UTC instead of throwing', () => {
  assert.equal(todayKey('Not/AZone', new Date('2026-10-18T10:00:00Z')), '2026-10-18');
});

test('monthOf', () => assert.equal(monthOf('2026-10-18'), '2026-10'));

import { zonedTimeToUtc } from './time';

test('zonedTimeToUtc converts wall-clock time in a zone to UTC', () => {
  assert.equal(zonedTimeToUtc('2026-10-05', '09:30', 'Asia/Kolkata')?.toISOString(), '2026-10-05T04:00:00.000Z');
  assert.equal(zonedTimeToUtc('2026-10-05', '00:15', 'Asia/Kolkata')?.toISOString(), '2026-10-04T18:45:00.000Z');
  assert.equal(zonedTimeToUtc('2026-07-01', '12:00', 'America/New_York')?.toISOString(), '2026-07-01T16:00:00.000Z');
  assert.equal(zonedTimeToUtc('2026-10-05', '25:00', 'UTC'), null);
  assert.equal(zonedTimeToUtc('2026-10-05', '09:00', 'Nope/Zone'), null);
});
