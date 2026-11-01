import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/** Apply committed migrations over the direct connection: `npm run db:migrate`. */
async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Set DIRECT_URL (or DATABASE_URL).');
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: './src/db/migrations' });
  await pool.end();
  console.log('Migrations applied.');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
