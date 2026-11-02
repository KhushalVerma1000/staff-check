import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, parseGeofence, withinGeofence } from './geo';

const pune = { lat: 18.5204, lng: 73.8567 };

test('distance is ~0 for the same point and ~111 km per degree of latitude', () => {
  assert.ok(distanceM(pune, pune) < 0.001);
  const d = distanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(Math.abs(d - 111_195) < 300, String(d));
});

test('geofence includes inside, excludes outside, and honours accuracy', () => {
  const fence = { ...pune, radiusM: 100 };
  const north = (m: number) => ({ lat: pune.lat + m / 111_195, lng: pune.lng });
  assert.equal(withinGeofence(fence, north(50)), true);
  assert.equal(withinGeofence(fence, north(150)), false);
  assert.equal(withinGeofence(fence, north(130), 40), true); // 130 - 40 <= 100
  assert.equal(withinGeofence(fence, north(10), 150), false); // fix worse than the fence
});

test('parseGeofence: all blank, partial, invalid, valid', () => {
  assert.deepEqual(parseGeofence({}), { ok: true, fence: null });
  assert.equal(parseGeofence({ lat: '18.5', lng: '', radiusM: '100' }).ok, false);
  assert.equal(parseGeofence({ lat: '95', lng: '73', radiusM: '100' }).ok, false);
  assert.equal(parseGeofence({ lat: '18.5', lng: '73', radiusM: '5' }).ok, false);
  assert.deepEqual(parseGeofence({ lat: '18.5', lng: '73.8', radiusM: '150.4' }), {
    ok: true,
    fence: { lat: 18.5, lng: 73.8, radiusM: 150 },
  });
});
