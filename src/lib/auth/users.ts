import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { db, account, session, user, type Role } from '@/db';

type Executor = Pick<typeof db, 'insert' | 'update' | 'delete' | 'select'>;

export interface NewLogin {
  email: string;
  name: string;
  role: Role;
  password: string;
  companyId?: string | null;
  employeeId?: string | null;
  mustChangePassword?: boolean;
}

/** Create a login (user row + credential account). Public sign-up is disabled, so this is the only way in. */
export async function createLogin(input: NewLogin, tx: Executor = db) {
  const [u] = await tx
    .insert(user)
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      companyId: input.companyId ?? null,
      employeeId: input.employeeId ?? null,
      mustChangePassword: input.mustChangePassword ?? true,
      emailVerified: true,
    })
    .returning();
  await tx.insert(account).values({
    accountId: u.id,
    providerId: 'credential',
    userId: u.id,
    password: await hashPassword(input.password),
  });
  return u;
}

/** Replace a login's password (admin reset) and end its live sessions. */
export async function resetLoginPassword(userId: string, password: string, mustChangePassword = true) {
  const hash = await hashPassword(password);
  await db.update(account).set({ password: hash }).where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));
  await db.update(user).set({ mustChangePassword }).where(eq(user.id, userId));
  await revokeSessions(userId);
}

/** End every live session of a login (after removal, suspension or a password reset). */
export async function revokeSessions(userId: string) {
  await db.delete(session).where(eq(session.userId, userId));
}
