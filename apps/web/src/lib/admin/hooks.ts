'use client';

import {
  adminCourseSchema,
  type Domain,
  domainSchema,
  type GenerateCourseBody,
  generateCourseResponseSchema,
  ingestionEventSchema,
  type JobDetail,
  jobDetailSchema,
  type UpdateDomainInput,
} from '@coursecraft/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { refreshCatalog } from '@/app/admin/actions';
import { api, apiUrl } from '@/lib/api';
import { hasActiveGeneration } from './courses';
import { catalogTagsFor } from './domains';
import { applyEvent, needsSnapshot } from './job-progress';

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

// ─── Course generation (#30) ──────────────────────────────────────────────

export function useGenerateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateCourseBody) =>
      api('courses/generate', { method: 'POST', json: body, schema: generateCourseResponseSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_COURSES_KEY }),
  });
}

export function useRetryJob() {
  return useMutation({
    mutationFn: (jobId: string) =>
      api(`jobs/${jobId}/retry`, { method: 'POST', schema: jobDetailSchema }),
  });
}

export type StreamState = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unavailable';

/**
 * A job's live state from its SSE stream (`GET /jobs/:id/events`, #28): the `job` snapshot,
 * then `progress` events until `done` or `failed`, when the stream is closed on purpose (a
 * browser EventSource would otherwise reconnect forever). After a dropped connection the browser
 * reconnects by itself and the new snapshot replaces the state. `restart()` opens a new stream
 * (after a retry).
 */
export function useJobStream(jobId: string) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [state, setState] = useState<StreamState>('connecting');
  const [generation, setGeneration] = useState(0);
  // The latest job, readable synchronously in event handlers (state updaters may run later).
  const current = useRef<JobDetail | null>(null);
  const put = useCallback((next: JobDetail | null) => {
    current.current = next;
    setJob(next);
  }, []);

  useEffect(() => {
    const source = new EventSource(apiUrl(`jobs/${jobId}/events`), { withCredentials: true });
    const read = <T>(
      schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
      e: Event,
    ) => {
      try {
        const parsed = schema.safeParse(JSON.parse((e as MessageEvent<string>).data));
        return parsed.success ? (parsed.data as T) : null;
      } catch {
        return null;
      }
    };
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const snapshot = await api(`jobs/${jobId}`, { schema: jobDetailSchema, cache: 'no-store' });
        // Keep whatever arrived meanwhile if it is further along.
        const latest = current.current;
        put(
          latest && latest.status === snapshot.status && latest.progress > snapshot.progress
            ? { ...snapshot, progress: latest.progress, stage: latest.stage }
            : snapshot,
        );
      } catch {
        // The stream keeps the page up to date; a missed refresh only delays the video list.
      } finally {
        refreshing = false;
      }
    };
    source.addEventListener('job', (e) => {
      const snapshot = read<JobDetail>(jobDetailSchema, e);
      if (snapshot) put(snapshot);
      setState('open');
    });
    source.addEventListener('progress', (e) => {
      const event = read(ingestionEventSchema, e);
      const latest = current.current;
      if (!event || !latest) return;
      const stale = needsSnapshot(latest, event);
      put(applyEvent(latest, event));
      if (stale) void refresh();
    });
    const finish = (e: Event) => {
      const final = read<JobDetail>(jobDetailSchema, e);
      if (final) put(final);
      source.close();
      setState('closed');
    };
    source.addEventListener('done', finish);
    source.addEventListener('failed', finish);
    source.onerror = () => {
      // CLOSED: the server refused (404/403) or the API is unreachable at the first try.
      setState(source.readyState === EventSource.CLOSED ? 'unavailable' : 'reconnecting');
    };
    return () => source.close();
  }, [jobId, generation, put]);

  const restart = useCallback(
    (snapshot?: JobDetail) => {
      if (snapshot) put(snapshot);
      setState('connecting');
      setGeneration((n) => n + 1);
    },
    [put],
  );

  return { job, state, restart };
}
