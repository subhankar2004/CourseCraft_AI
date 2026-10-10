import { type Domain, domainSchema } from '@coursecraft/shared';
import { cacheLife, cacheTag } from 'next/cache';
import { apiUrl } from '@/lib/api';

/**
 * Domains for the landing page, fetched on the server and cached (Next.js `use cache`), so the
 * page stays static and fast. Returns `null` when the API can't be reached: e.g. during
 * `next build` in CI, where no API runs. That outcome is cached only briefly, so the section
 * fills in soon after the API is available again.
 */
export async function getFeaturedDomains(): Promise<Domain[] | null> {
  'use cache';
  cacheTag('domains');
  try {
    const res = await fetch(apiUrl('domains'), { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`GET /domains → ${res.status}`);
    const domains = domainSchema.array().parse(await res.json());
    cacheLife('hours');
    return domains;
  } catch {
    cacheLife('seconds');
    return null;
  }
}
