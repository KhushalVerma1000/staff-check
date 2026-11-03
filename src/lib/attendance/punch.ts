import { distanceM, withinGeofence, type Geofence, type Point } from '@/lib/geo';

export type PunchOutcome = 'OK' | 'OUTSIDE_GEOFENCE' | 'NO_LOCATION' | 'POOR_ACCURACY';

export interface PunchDecision {
  outcome: PunchOutcome;
  /** Metres from the fence centre, when a fence and a position both exist. */
  distanceM: number | null;
}

/** Fixes worse than this are rejected even without a fence check being meaningful. */
export const MAX_ACCURACY_M = 200;

/**
 * Decide whether a check-in attempt counts.
 *  - No geofence on the branch: any attempt is OK (location is optional).
 *  - Geofence set: a position is required, it must be accurate enough, and inside the fence.
 */
export function evaluatePunch(input: { fence: Geofence | null; position: Point | null; accuracyM?: number | null }): PunchDecision {
  const { fence, position } = input;
  const acc = input.accuracyM ?? 0;
  if (!fence) return { outcome: 'OK', distanceM: null };
  if (!position) return { outcome: 'NO_LOCATION', distanceM: null };
  const d = Math.round(distanceM(fence, position));
  if (acc > Math.max(MAX_ACCURACY_M, fence.radiusM)) return { outcome: 'POOR_ACCURACY', distanceM: d };
  return { outcome: withinGeofence(fence, position, acc) ? 'OK' : 'OUTSIDE_GEOFENCE', distanceM: d };
}

/** The sentence shown to the employee when an attempt is refused. */
export function refusalMessage(d: PunchDecision, fence: Geofence | null, branchName: string): string {
  switch (d.outcome) {
    case 'NO_LOCATION':
      return `${branchName} needs your location to check in. Allow location access and try again.`;
    case 'POOR_ACCURACY':
      return 'Your location is not precise enough right now. Move near a window or outside, then try again.';
    case 'OUTSIDE_GEOFENCE':
      return `You are about ${d.distanceM} m from ${branchName}${fence ? ` (allowed: ${fence.radiusM} m)` : ''}. Move closer to check in. This attempt was recorded.`;
    default:
      return '';
  }
}
