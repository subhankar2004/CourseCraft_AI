'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '@/lib/api';

const liveSchema = z.object({ status: z.literal('ok') });

/**
 * Small live indicator that the web app can reach the API (exercises the API client + CORS).
 * Uses the liveness probe: `/health` also checks the AI service (#26) and returns 503 while it is
 * down, which would wrongly show the API itself as offline.
 */
export function ApiStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health', 'live'],
    queryFn: () => api('health/live', { schema: liveSchema }),
    refetchInterval: 30_000,
  });

  const [label, dot] = isPending
    ? ['Checking API…', 'bg-muted-foreground']
    : isError || data?.status !== 'ok'
      ? ['API offline', 'bg-destructive']
      : ['API online', 'bg-emerald-500'];

  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className={`size-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}
