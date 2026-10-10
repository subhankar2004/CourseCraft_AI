/**
 * Accepts only same-site relative paths for post-login redirects (`?next=`), so a crafted link
 * can't send users to another site after they sign in (OWASP: unvalidated redirects).
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback;
  }
  try {
    // Resolving against a dummy origin must not change the origin (rejects e.g. "/\t/evil.com").
    const url = new URL(raw, 'https://coursecraft.invalid');
    if (url.origin !== 'https://coursecraft.invalid') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
