import { z } from 'zod';

/**
 * The one place environment variables are read and validated.
 * Parsed lazily on first use so `next build` and tests don't need every secret.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is not set.'),
  DIRECT_URL: z.string().optional(),
  /** Max pooled connections per server instance (keep low on serverless; Neon's pooler does the rest). */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -base64 32).'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  /** 32 random bytes, base64 (openssl rand -base64 32). Encrypts ID, statutory and bank numbers. */
  KYC_ENCRYPTION_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid environment: ${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}
