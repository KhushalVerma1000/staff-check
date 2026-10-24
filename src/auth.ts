import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authConfig } from '@/auth.config';

/**
 * Sessions are stateless JWTs, so a removed login or a suspended company would
 * otherwise keep working until the token expires. The Node config re-checks the
 * user row on each session read, cached per server instance for a minute.
 * It also refreshes the role / company link, so changes apply without re-login.
 */
const CHECK_TTL_MS = 60_000;

type LoginState = {
  removed: boolean;
  role?: string;
  companyId?: string | null;
  employeeId?: string | null;
};
const cache = new Map<string, LoginState & { at: number }>();

async function loadLoginState(userId: string): Promise<LoginState> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && now - hit.at < CHECK_TTL_MS) return hit;
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        deletedAt: true,
        role: true,
        companyId: true,
        employeeId: true,
        company: { select: { status: true } },
      },
    });
    const removed = !row || row.deletedAt !== null || row.company?.status === 'SUSPENDED';
    const state: LoginState & { at: number } = {
      at: now,
      removed,
      role: row?.role,
      companyId: row?.companyId ?? null,
      employeeId: row?.employeeId ?? null,
    };
    cache.set(userId, state);
    return state;
  } catch {
    // A database blip must neither sign everybody out nor widen anyone's access.
    return hit ?? { removed: false };
  }
}

/** Drop the cached state so a role / suspension change applies on the next request. */
export function forgetLoginState(userId: string) {
  cache.delete(userId);
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (token?.id) {
        const state = await loadLoginState(token.id);
        token.removed = state.removed || undefined;
        if (!state.removed && state.role) {
          token.role = state.role as typeof token.role;
          token.companyId = state.companyId ?? null;
          token.employeeId = state.employeeId ?? null;
        }
      }
      return token;
    },
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            role: true,
            companyId: true,
            employeeId: true,
            mustChangePassword: true,
            deletedAt: true,
            company: { select: { status: true } },
          },
        });
        if (!user || user.deletedAt) return null;
        if (user.company?.status === 'SUSPENDED') return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          employeeId: user.employeeId,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
});
