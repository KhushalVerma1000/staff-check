import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelsFor, NOTIFY_KINDS } from './prefs';

test('channels default to both on', () => {
  assert.deepEqual(channelsFor([], 'leave.decided'), { inApp: true, email: true });
});

test('a saved preference applies only to its own event', () => {
  const prefs = [{ kind: 'leave.requested', inApp: true, email: false }];
  assert.deepEqual(channelsFor(prefs, 'leave.requested'), { inApp: true, email: false });
  assert.deepEqual(channelsFor(prefs, 'leave.decided'), { inApp: true, email: true });
});

test('event kinds are unique', () => {
  const kinds = NOTIFY_KINDS.map((k) => k.kind);
  assert.equal(new Set(kinds).size, kinds.length);
});
