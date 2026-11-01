import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Migrations use the DIRECT (non-pooled) Neon connection; the running app uses
 * the pooled DATABASE_URL (src/db/index.ts). Locally both can be the same URL.
 * `drizzle-kit generate` needs no database.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' },
});
