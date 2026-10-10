import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'cc_session';
export const JWT_ISSUER = 'coursecraft-api';
export const JWT_AUDIENCE = 'coursecraft-web';

/**
 * httpOnly: unreadable from JavaScript (limits XSS token theft).
 * SameSite=Lax: not sent on cross-site POSTs (CSRF protection together with the JSON-only API
 * and strict CORS). Secure in production so it is never sent over plain HTTP.
 */
export function sessionCookieOptions(production: boolean, maxAgeSeconds: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  };
}
