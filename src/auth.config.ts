import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@/generated/prisma/client';

/**
 * Edge-safe Auth.js config shared by `src/auth.ts` and `src/middleware.ts`.
 * Must NOT import Prisma or bcrypt: the middleware runs on the edge.
 */
export const authConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role as Role;
        token.companyId = user.companyId ?? null;
        token.employeeId = user.employeeId ?? null;
        token.mustChangePassword = user.mustChangePassword ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.removed) {
        // Hand back a session with no user so every `!session?.user` guard treats this browser as signed out.
        return { expires: session.expires } as unknown as typeof session;
      }
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.companyId = (token.companyId as string | null) ?? null;
        session.user.employeeId = (token.employeeId as string | null) ?? null;
        session.user.mustChangePassword = (token.mustChangePassword as boolean) ?? false;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
