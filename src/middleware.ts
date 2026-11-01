import { NextResponse, type NextRequest } from 'next/server';

/**
 * Coarse, edge-safe gate: is there a session cookie at all? The real checks
 * (role, company, removed / suspended, must-change-password) run on the server
 * in src/lib/session.ts, and every server action calls can() too.
 */
export default function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  // Cookie name per Better Auth defaults (prefixed with __Secure- over https). Importing
  // better-auth/cookies here would pull Node-only crypto into the edge bundle.
  const hasSession = Boolean(
    req.cookies.get('better-auth.session_token') ?? req.cookies.get('__Secure-better-auth.session_token'),
  );

  if (path === '/login' || path.startsWith('/api/auth')) return NextResponse.next();

  if (!hasSession) {
    const url = new URL('/login', nextUrl);
    if (path !== '/') url.searchParams.set('from', path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
