import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');

  // Prisma 7 talks to Postgres through the node-postgres driver adapter.
  // node-pg has no connection timeout by default (Prisma 6 used 5s), so set one
  // — otherwise a database outage hangs requests instead of failing fast.
  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

/**
 * Prisma Client singleton — prevents multiple client instances (and pools) in
 * development due to hot module reloading.
 */
export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
