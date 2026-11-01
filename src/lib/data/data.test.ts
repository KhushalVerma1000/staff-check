import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BreakerOpenError, CircuitBreaker } from './breaker';
import { pickCloudAccount, placementFor, DEFAULT_PLACEMENT } from './placement';
import { replayOutbox } from './outbox';

const boom = () => Promise.reject(new Error('down'));

test('breaker opens after threshold, fails fast, then half-opens and recovers', async () => {
  let t = 0;
  const b = new CircuitBreaker('mongo', { threshold: 2, cooldownMs: 100, now: () => t });
  await assert.rejects(b.run(boom), /down/);
  assert.equal(b.state, 'closed');
  await assert.rejects(b.run(boom), /down/);
  assert.equal(b.state, 'open');
  await assert.rejects(b.run(async () => 1), BreakerOpenError);
  t = 150;
  assert.equal(b.state, 'half-open');
  assert.equal(await b.run(async () => 'ok'), 'ok');
  assert.equal(b.state, 'closed');
});

test('a failed half-open trial re-opens the breaker', async () => {
  let t = 0;
  const b = new CircuitBreaker('pg', { threshold: 1, cooldownMs: 100, now: () => t });
  await assert.rejects(b.run(boom));
  t = 200;
  await assert.rejects(b.run(boom), /down/);
  assert.equal(b.state, 'open');
});

test('placement defaults and cloud account choice', async () => {
  assert.deepEqual(await placementFor('c1'), DEFAULT_PLACEMENT);
  assert.equal(
    pickCloudAccount([
      { cloudName: 'a', usedBytes: 90, quotaBytes: 100 },
      { cloudName: 'b', usedBytes: 10, quotaBytes: 100 },
    ]),
    'b',
  );
  assert.throws(() => pickCloudAccount([]));
});

test('outbox replays in order and stops at the first failure', async () => {
  const seen: number[] = [];
  const items = [3, 1, 2].map((seq) => ({ id: `i${seq}`, seq, kind: 'punch', payload: null }));
  const applied = await replayOutbox(items, async (i) => {
    if (i.seq === 2) throw new Error('mongo down');
    seen.push(i.seq);
  });
  assert.deepEqual(applied, ['i1']);
  assert.deepEqual(seen, [1]);
});
