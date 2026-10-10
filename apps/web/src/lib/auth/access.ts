/**
 * Route-level access decisions for proxy.ts. These are OPTIMISTIC checks for navigation only
 * (Next.js authentication guide): the web app never holds the JWT secret, so it reads the
 * session cookie without verifying it. The API verifies every request and is the authority.
 */
export const SESSION_COOKIE = 'cc_session';

const SIGNED_IN_PREFIXES = ['/dashboard', '/learn', '/admin'];
const ADMIN_PREFIX = '/admin';

export type AccessDecision = 'allow' | 'login' | 'forbidden';

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Reads the `role` claim from a JWT payload without verifying the signature (routing hint only). */
export function peekRole(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as unknown;
    const role = (json as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

export function decideAccess(pathname: string, sessionToken: string | undefined): AccessDecision {
  if (!SIGNED_IN_PREFIXES.some((prefix) => matches(pathname, prefix))) return 'allow';
  if (!sessionToken) return 'login';
  if (matches(pathname, ADMIN_PREFIX) && peekRole(sessionToken) !== 'ADMIN') return 'forbidden';
  return 'allow';
}
