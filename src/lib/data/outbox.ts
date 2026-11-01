/**
 * Outbox contract: cross-store writes (a punch destined for MongoDB) are first
 * saved as a Postgres row, then replayed in order. If Mongo is down a check-in
 * is never lost. The Postgres table and the Mongo/Cloudinary clients land with
 * the attendance phase; this file fixes the interface and the replay rule.
 */
export interface OutboxItem {
  id: string;
  seq: number;
  kind: string;
  payload: unknown;
}

/**
 * Replay items oldest-first. Stops at the first failure so order is preserved
 * (a later punch is never applied before an earlier one). Returns applied ids.
 */
export async function replayOutbox(items: OutboxItem[], apply: (item: OutboxItem) => Promise<void>): Promise<string[]> {
  const applied: string[] = [];
  for (const item of [...items].sort((a, b) => a.seq - b.seq)) {
    try {
      await apply(item);
    } catch {
      break;
    }
    applied.push(item.id);
  }
  return applied;
}
