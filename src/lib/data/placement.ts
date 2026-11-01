/**
 * Where a client's data lives (spec: tenant_placement). Today every tenant maps
 * to the single default placement from env; the shape is what the platform
 * console will edit once per-client shards exist, so callers already go through
 * `placementFor` and never read connection strings themselves.
 */
export interface Placement {
  pgShard: string;
  mongoShard: string;
  /** Cloudinary account (cloud_name) that holds this tenant's files. */
  cloudName: string;
}

export const DEFAULT_PLACEMENT: Placement = { pgShard: 'primary', mongoShard: 'primary', cloudName: 'default' };

export interface PlacementStore {
  get(companyId: string): Promise<Placement | null>;
}

/** Resolve a tenant's placement, falling back to the default when none is recorded. */
export async function placementFor(companyId: string, store?: PlacementStore): Promise<Placement> {
  if (!companyId) throw new Error('placementFor needs a company id.');
  return (await store?.get(companyId)) ?? DEFAULT_PLACEMENT;
}

/** New clients go to the Cloudinary account with the most free quota. */
export function pickCloudAccount(accounts: Array<{ cloudName: string; usedBytes: number; quotaBytes: number }>): string {
  if (accounts.length === 0) throw new Error('No Cloudinary account configured.');
  return [...accounts].sort((a, b) => b.quotaBytes - b.usedBytes - (a.quotaBytes - a.usedBytes))[0].cloudName;
}
