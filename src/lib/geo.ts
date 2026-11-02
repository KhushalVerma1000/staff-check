import { z } from 'zod';

export interface Point {
  lat: number;
  lng: number;
}
export interface Geofence extends Point {
  radiusM: number;
}

export const MIN_RADIUS_M = 20;
export const MAX_RADIUS_M = 5000;

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceM(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Is a reported position inside the fence? `accuracyM` (the device's reported
 * error) is subtracted from the distance so a poor GPS fix cannot push someone
 * outside, but a fix worse than the radius itself is never accepted.
 */
export function withinGeofence(fence: Geofence, p: Point, accuracyM = 0): boolean {
  if (accuracyM > fence.radiusM) return false;
  return distanceM(fence, p) - Math.max(0, accuracyM) <= fence.radiusM;
}

const num = (label: string, min: number, max: number) =>
  z.coerce.number({ message: `Enter a valid ${label}.` }).min(min, `${label} must be between ${min} and ${max}.`).max(max, `${label} must be between ${min} and ${max}.`);

const fenceSchema = z.object({
  lat: num('latitude', -90, 90),
  lng: num('longitude', -180, 180),
  radiusM: num('radius', MIN_RADIUS_M, MAX_RADIUS_M).transform((n) => Math.round(n)),
});

/**
 * Parse the three optional geofence form fields. All blank → `{ ok: true, fence: null }`
 * (no geofence); some blank → error; otherwise a validated fence.
 */
export function parseGeofence(input: {
  lat?: string | null;
  lng?: string | null;
  radiusM?: string | null;
}): { ok: true; fence: Geofence | null } | { ok: false; error: string } {
  const vals = [input.lat, input.lng, input.radiusM].map((v) => (v ?? '').trim());
  if (vals.every((v) => v === '')) return { ok: true, fence: null };
  if (vals.some((v) => v === '')) return { ok: false, error: 'Fill in latitude, longitude and radius, or leave all three empty.' };
  const r = fenceSchema.safeParse({ lat: vals[0], lng: vals[1], radiusM: vals[2] });
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Invalid geofence.' };
  return { ok: true, fence: r.data };
}
