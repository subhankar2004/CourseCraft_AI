'use client';

import {
  adminCourseSchema,
  type Domain,
  domainSchema,
  type UpdateDomainInput,
} from '@coursecraft/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { refreshCatalog } from '@/app/admin/actions';
import { api } from '@/lib/api';
import { hasActiveGeneration } from './courses';
import { catalogTagsFor } from './domains';

export const ADMIN_COURSES_KEY = ['admin', 'courses'] as const;
export const DOMAINS_KEY = ['domains'] as const;

/** All courses (any status). Polls every 3 s while one is being generated. */
export function useAdminCourses() {
  return useQuery({
    queryKey: ADMIN_COURSES_KEY,
    queryFn: () => api('admin/courses', { schema: adminCourseSchema.array() }),
    refetchInterval: (query) => (hasActiveGeneration(query.state.data) ? 3_000 : false),
  });
}

export function useDomains() {
  return useQuery({
    queryKey: DOMAINS_KEY,
    queryFn: () => api('domains', { schema: domainSchema.array(), cache: 'no-store' }),
  });
}

/** After a change: refetch admin data, and expire the public catalog pages it affects. */
function useAfterDomainChange() {
  const queryClient = useQueryClient();
  return async (...slugs: (string | undefined)[]) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: DOMAINS_KEY }),
      queryClient.invalidateQueries({ queryKey: ADMIN_COURSES_KEY }),
    ]);
    try {
      await refreshCatalog(catalogTagsFor(...slugs));
    } catch {
      // The change itself succeeded; public pages just update when their cache expires.
      toast.warning('Saved, but public pages may take a while to show the change.');
    }
  };
}

export function useCreateDomain() {
  const after = useAfterDomainChange();
  return useMutation({
    mutationFn: (body: object) =>
      api('domains', { method: 'POST', json: body, schema: domainSchema }),
    onSuccess: (domain) => after(domain.slug),
  });
}

export function useUpdateDomain() {
  const after = useAfterDomainChange();
  return useMutation({
    mutationFn: ({ domain, body }: { domain: Domain; body: UpdateDomainInput }) =>
      api(`domains/${domain.id}`, { method: 'PATCH', json: body, schema: domainSchema }),
    onSuccess: (updated, { domain }) => after(domain.slug, updated.slug),
  });
}

export function useDeleteDomain() {
  const after = useAfterDomainChange();
  return useMutation({
    mutationFn: (domain: Domain) => api(`domains/${domain.id}`, { method: 'DELETE' }),
    onSuccess: (_, domain) => after(domain.slug),
  });
}
