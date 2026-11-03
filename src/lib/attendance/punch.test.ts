import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePunch, refusalMessage } from './punch';

const fence = { lat: 18.5204, lng: 73.8567, radiusM: 100 };
const north = (m: number) => ({ lat: fence.lat + m / 111_195, lng: fence.lng });

test('no fence: always OK, location optional', () => {
  assert.deepEqual(evaluatePunch({ fence: null, position: null }), { outcome: 'OK', distanceM: null });
  assert.equal(evaluatePunch({ fence: null, position: north(5000) }).outcome, 'OK');
});

test('fence: location required, then distance decides', () => {
  assert.equal(evaluatePunch({ fence, position: null }).outcome, 'NO_LOCATION');
  assert.equal(evaluatePunch({ fence, position: north(40), accuracyM: 10 }).outcome, 'OK');
  const far = evaluatePunch({ fence, position: north(400), accuracyM: 10 });
  assert.equal(far.outcome, 'OUTSIDE_GEOFENCE');
  assert.ok(Math.abs((far.distanceM ?? 0) - 400) < 3);
});

test('poor accuracy is refused, good accuracy forgives a near miss', () => {
  assert.equal(evaluatePunch({ fence, position: north(10), accuracyM: 500 }).outcome, 'POOR_ACCURACY');
  assert.equal(evaluatePunch({ fence, position: north(130), accuracyM: 40 }).outcome, 'OK');
});

test('refusal messages mention distance and that the attempt was recorded', () => {
  const d = evaluatePunch({ fence, position: north(400) });
  const m = refusalMessage(d, fence, 'Head office');
  assert.match(m, /Head office/);
  assert.match(m, /recorded/);
  assert.match(refusalMessage({ outcome: 'NO_LOCATION', distanceM: null }, fence, 'HO'), /location/);
});
