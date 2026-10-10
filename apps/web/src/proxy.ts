import { type NextRequest, NextResponse } from 'next/server';
import { decideAccess, SESSION_COOKIE } from '@/lib/auth/access';

/**
 * Optimistic route protection (no database or API calls here; it runs on every navigation and
 * prefetch). Signed-out users are sent to /login?next=…; non-admins get a real 403 on /admin.
 * The API independently authorises every request.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const decision = decideAccess(pathname, request.cookies.get(SESSION_COOKIE)?.value);

  if (decision === 'login') {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  if (decision === 'forbidden') {
    return NextResponse.rewrite(new URL('/forbidden', request.url), { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  // Only the areas that need a session; static assets and public pages skip the proxy entirely.
  matcher: ['/dashboard/:path*', '/learn/:path*', '/admin/:path*'],
};
