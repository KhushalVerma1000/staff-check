import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { eq } from 'drizzle-orm';
import { db, account, company, session, user, verification } from '@/db';
import { env } from '@/lib/env';

/**
 * Better Auth: email + password, cookie sessions stored in Postgres.
 *
 * - Public sign-up is off. Logins are created by admins / the platform
 *   (src/lib/auth/users.ts), who hand over a one-time password.
 * - Sessions are database rows, so removing a login or suspending a company
 *   takes effect on the next request (and `revokeSessions` ends live ones).
 * - The `role` / `companyId` fields are never writable from the client.
 */
export const auth = betterAuth({
  baseURL: env().BETTER_AUTH_URL,
  secret: env().BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: false,
  },
  session: {
    // 7 days, sliding.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      role: { type: 'string', required: true, input: false },
      companyId: { type: 'string', required: false, input: false },
      employeeId: { type: 'string', required: false, input: false },
      mustChangePassword: { type: 'boolean', required: false, input: false, defaultValue: true },
      deletedAt: { type: 'date', required: false, input: false },
      lastLoginAt: { type: 'date', required: false, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Refuse to start a session for a removed login or a suspended company.
        before: async (s) => {
          const [row] = await db
            .select({ deletedAt: user.deletedAt, status: company.status })
            .from(user)
            .leftJoin(company, eq(company.id, user.companyId))
            .where(eq(user.id, s.userId))
            .limit(1);
          if (!row || row.deletedAt || row.status === 'SUSPENDED') return false;
          return { data: s };
        },
        after: async (s) => {
          await db.update(user).set({ lastLoginAt: new Date() }).where(eq(user.id, s.userId));
        },
      },
    },
  },
  advanced: { database: { generateId: () => crypto.randomUUID() } },
  plugins: [nextCookies()], // keep last
});
