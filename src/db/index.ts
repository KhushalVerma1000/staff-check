import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { env } from '@/lib/env';

export type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __pool?: Pool; __db?: Db };

/**
 * App database (Neon pooled URL). node-pg has no connection timeout by default,
 * so set one: a database outage should fail fast, not hang requests.
 * Application code must not import this directly: go through the data layer
 * (src/lib/data) or the tenant helpers (src/lib/tenant) so tenant scoping holds.
 */
function create(): Db {
  const pool = new Pool({ connectionString: env().DATABASE_URL, connectionTimeoutMillis: 5_000, max: env().DB_POOL_MAX });
  g.__pool = pool;
  return drizzle(pool, { schema, casing: undefined });
}

export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    g.__db ??= create();
    return Reflect.get(g.__db, prop);
  },
});

export * from './schema';
