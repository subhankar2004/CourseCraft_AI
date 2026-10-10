import {
  type Domain,
  type DomainDetail,
  domainDetailSchema,
  domainSchema,
} from '@coursecraft/shared';
import { cacheLife, cacheTag } from 'next/cache';
import { apiUrl } from '@/lib/api';

/**
 * Server-side catalog reads, cached with Next.js `use cache` so catalog pages are static and
 * revalidate in the background (`cacheLife('hours')`).
 *
 * When the API can't be reached (e.g. `next build` in CI, where no API runs) the functions return
 * UNAVAILABLE instead of throwing, cached with `cacheLife('minutes')`. Two Next.js rules shape this:
 *  - an error thrown inside `use cache` during prerendering fails the build, even if caught;
 *  - entries with `expire` under 5 minutes (the `seconds` profile) are excluded from prerenders,
 *    which breaks routes that share the function ("unexpected cache miss").
 * `minutes` revalidates every minute, so pages recover shortly after the API is back.
 */

export const UNAVAILABLE = 'unavailable' as const;
export type Unavailable = typeof UNAVAILABLE;

const TIMEOUT_MS = 5_000;

type Fetched = { status: number; body: unknown } | Unavailable;

async function getJson(path: string): Promise<Fetched> {
  try {
    const res = await fetch(apiUrl(path), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status >= 500) return UNAVAILABLE;
    return { status: res.status, body: await res.json() };
  } catch (error) {
    console.error(`[catalog] GET /${path} failed`, error);
    return UNAVAILABLE;
  }
}

export async function getDomains(): Promise<Domain[] | Unavailable> {
  'use cache';
  cacheTag('domains');
  const res = await getJson('domains');
  const parsed = res === UNAVAILABLE ? null : domainSchema.array().safeParse(res.body);
  if (!parsed?.success) {
    cacheLife('minutes');
    return UNAVAILABLE;
  }
  cacheLife('hours');
  return parsed.data;
}

/** A domain with its published courses, `null` if it doesn't exist. */
export async function getDomain(slug: string): Promise<DomainDetail | null | Unavailable> {
  'use cache';
  cacheTag('domains', `domain:${slug}`);
  const res = await getJson(`domains/${encodeURIComponent(slug)}`);
  if (res !== UNAVAILABLE && res.status === 404) {
    cacheLife('minutes'); // the domain may be created later
    return null;
  }
  const parsed = res === UNAVAILABLE ? null : domainDetailSchema.safeParse(res.body);
  if (!parsed?.success) {
    cacheLife('minutes');
    return UNAVAILABLE;
  }
  cacheLife('hours');
  return parsed.data;
}

/** Domain slugs for `generateStaticParams`: build time only, so not cached. Empty on failure. */
export async function getDomainSlugsForBuild(): Promise<string[]> {
  const res = await getJson('domains');
  if (res === UNAVAILABLE) return [];
  const parsed = domainSchema.array().safeParse(res.body);
  return parsed.success ? parsed.data.map((domain) => domain.slug) : [];
}
