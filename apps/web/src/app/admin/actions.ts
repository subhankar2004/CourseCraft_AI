'use server';

import { userSchema } from '@coursecraft/shared';
import { updateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { apiUrl } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/auth/access';

/** Only the catalog's own tags (lib/catalog.ts) can be refreshed. */
const CATALOG_TAG = /^(domains|courses|domain:[a-z0-9-]{1,60}|course:[a-z0-9-]{1,80})$/;

/**
 * Refreshes cached public catalog pages after an admin change, so the admin (and everyone)
 * sees it at once instead of after the cache lifetime. Server Actions are public endpoints, so
 * the caller is checked with the API first: only an admin can expire cache entries.
 */
export async function refreshCatalog(tags: string[]): Promise<void> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) throw new Error('Not signed in');
  const res = await fetch(apiUrl('auth/me'), {
    headers: { cookie: `${SESSION_COOKIE}=${session}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  const user = res.ok ? userSchema.safeParse(await res.json()).data : undefined;
  if (user?.role !== 'ADMIN') throw new Error('Only admins can refresh the catalog');
  for (const tag of tags) if (CATALOG_TAG.test(tag)) updateTag(tag);
}
