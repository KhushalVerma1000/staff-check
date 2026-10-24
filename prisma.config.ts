import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 reads the database connection here, not in schema.prisma.
 *
 * The CLI (migrate, db push, studio) connects with DIRECT_URL — a direct,
 * non-pooled connection, which is what migrations need. The running app
 * connects with DATABASE_URL (the pooled URL) through the driver adapter in
 * src/lib/prisma.ts. Locally both can be the same URL.
 *
 * `prisma generate` needs no database, so a missing URL must not fail it
 * (CI, fresh clones, `npm install`). Commands that do need one will report
 * an empty connection string.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
