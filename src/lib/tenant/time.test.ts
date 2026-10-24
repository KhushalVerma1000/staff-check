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
