import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

// Edge-safe instance: no Prisma / bcrypt here (see src/auth.config.ts).
const { auth } = NextAuth(authConfig);

/**
 * Coarse route guard. Every server action ALSO calls can() — this is
 * defence in depth, not the only enforcement.
 */
export default auth((req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;
  const path = nextUrl.pathname;

  const isPublic = path === '/login' || path.startsWith('/api/auth');
  if (isPublic) {
    if (user && path === '/login') {
      return NextResponse.redirect(new URL(user.role === 'SUPER_ADMIN' ? '/platform' : '/dashboard', nextUrl));
    }
    return NextResponse.next();
  }

  if (!user) {
    const url = new URL('/login', nextUrl);
    if (path !== '/') url.searchParams.set('from', path);
    return NextResponse.redirect(url);
  }

  if (user.mustChangePassword && path !== '/change-password') {
    return NextResponse.redirect(new URL('/change-password', nextUrl));
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const onPlatform = path === '/platform' || path.startsWith('/platform/');
  if (onPlatform && !isSuperAdmin) return NextResponse.redirect(new URL('/dashboard', nextUrl));
  if (!onPlatform && isSuperAdmin && path !== '/change-password' && path !== '/') {
    return NextResponse.redirect(new URL('/platform', nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
