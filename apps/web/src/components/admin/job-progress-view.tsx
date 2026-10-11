'use client';

import type { JobVideoStatus } from '@coursecraft/shared';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleIcon,
  Loader2Icon,
  RotateCcwIcon,
  XCircleIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useJobStream, useRetryJob } from '@/lib/admin/hooks';
import {
  currentVideoPosition,
  isActive,
  STEPS,
  type StepState,
  stepStates,
  truncationNote,
} from '@/lib/admin/job-progress';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Where a finished job takes the admin (#31 adds the course review page). */
const AFTER_DONE = '/admin/courses';
const REDIRECT_DELAY_MS = 2_500;

export function JobProgressView({ jobId }: { jobId: string }) {
  const router = useRouter();
  const { job, state, restart } = useJobStream(jobId);
  const retry = useRetryJob();

  // Redirect only when the job finishes while the admin watches; opening a finished job later
  // shows its summary instead of bouncing away. (State set during render: React's pattern for
  // remembering something about previous renders.)
  const [watchedRunning, setWatchedRunning] = useState(false);
  if (job && isActive(job) && !watchedRunning) setWatchedRunning(true);

  useEffect(() => {
    if (job?.status !== 'SUCCEEDED' || !watchedRunning) return;
    toast.success(`“${job.course.title}” is ready as a draft`);
    const timer = setTimeout(() => router.push(AFTER_DONE), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [job?.status, job?.course.title, router, watchedRunning]);

  if (!job) {
    if (state === 'unavailable') {
      return (
        <div role="alert" className="rounded-lg border p-6 text-sm">
          <p>Could not load this job. It may not exist, or the API is unreachable.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => restart()}>
            Try again
          </Button>
        </div>
      );
    }
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading job">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const onRetry = async () => {
    try {
      restart(await retry.mutateAsync(job.id));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not retry the job');
    }
  };

  const steps = stepStates(job);
  const truncated = truncationNote(job);
  const failedVideos = job.videos.filter((v) => v.status === 'FAILED').length;
  const working = currentVideoPosition(job);

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground">
          {{ SUCCEEDED: 'Generated', FAILED: 'Generation failed' }[job.status as string] ??
            'Generating'}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{job.course.title}</h1>
        {state === 'reconnecting' && isActive(job) && (
          <p className="text-xs text-amber-600 dark:text-amber-400" role="status">
            Connection lost, reconnecting…
          </p>
        )}
      </header>

      <ol className="grid gap-2 sm:grid-cols-5" aria-label="Stages">
        {STEPS.map((step, index) => (
          <Step key={step.stage} label={step.label} detail={step.detail} state={steps[index]!} />
        ))}
      </ol>

      <div className="grid gap-1">
        <div
          role="progressbar"
          aria-label="Overall progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={job.progress}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500',
              job.status === 'FAILED'
                ? 'bg-destructive'
                : job.status === 'SUCCEEDED'
                  ? 'bg-emerald-500'
                  : 'bg-sky-500',
            )}
            style={{ width: `${job.progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {job.progress}%{job.status === 'QUEUED' ? ' · waiting for the worker' : ''}
        </p>
      </div>

      {job.status === 'QUEUED' && job.error && (
        <p
          role="status"
          className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
        >
          {job.error.replace(/^retrying: /, 'A service was unavailable; retrying automatically: ')}
        </p>
      )}

      {job.status === 'FAILED' && (
        <div
          role="alert"
          className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <div className="flex items-start gap-2">
            <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <div>
              <p className="font-medium">Generation failed</p>
              {job.error && <p className="mt-1 break-words text-muted-foreground">{job.error}</p>}
            </div>
          </div>
          <div>
            <Button size="sm" onClick={() => void onRetry()} disabled={retry.isPending}>
              <RotateCcwIcon aria-hidden />
              {retry.isPending ? 'Retrying…' : 'Retry'}
            </Button>
            <span className="ml-3 text-xs text-muted-foreground">
              Finished videos are kept; failed ones start again from their last step.
            </span>
          </div>
        </div>
      )}

      {job.status === 'SUCCEEDED' && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm"
        >
          <CheckCircle2Icon className="size-4 text-emerald-600" aria-hidden />
          <span>
            The course is ready as a <strong>draft</strong>
            {failedVideos > 0 && ` (${failedVideos} video${failedVideos === 1 ? '' : 's'} skipped)`}
            .{watchedRunning ? ' Taking you to the course list…' : ''}
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href={AFTER_DONE}>{watchedRunning ? 'Go now' : 'Open the course list'}</Link>
          </Button>
        </div>
      )}

      {truncated && <p className="text-sm text-muted-foreground">{truncated}</p>}

      <section aria-label="Videos" className="grid gap-2">
        <h2 className="text-sm font-medium">
          Videos <span className="text-muted-foreground">({job.videos.length})</span>
        </h2>
        {job.videos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Fetching the video list…</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {job.videos.map((video) => (
              <li key={video.position} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <VideoStatusIcon status={video.status} working={video.position === working} />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{video.title ?? video.youtubeId}</p>
                  {video.error && (
                    <p className="text-xs break-words text-destructive">{video.error}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {video.position === working
                    ? (WORKING_LABELS[job.stage ?? ''] ?? 'Working…')
                    : VIDEO_LABELS[video.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const WORKING_LABELS: Record<string, string> = {
  TRANSCRIPT: 'Fetching transcript…',
  NOTES: 'Writing notes…',
};

const VIDEO_LABELS: Record<JobVideoStatus, string> = {
  PENDING: 'Waiting',
  TRANSCRIBED: 'Transcript ready',
  PROCESSED: 'Lesson ready',
  FAILED: 'Skipped',
};

function VideoStatusIcon({ status, working }: { status: JobVideoStatus; working: boolean }) {
  const className = 'mt-0.5 size-4 shrink-0';
  if (working)
    return <Loader2Icon className={cn(className, 'animate-spin text-sky-600')} aria-hidden />;
  if (status === 'PROCESSED')
    return <CheckCircle2Icon className={cn(className, 'text-emerald-600')} aria-hidden />;
  if (status === 'FAILED')
    return <AlertCircleIcon className={cn(className, 'text-destructive')} aria-hidden />;
  if (status === 'TRANSCRIBED')
    return <CircleIcon className={cn(className, 'text-sky-600/60')} aria-hidden />;
  return <CircleDashedIcon className={cn(className, 'text-muted-foreground')} aria-hidden />;
}

function Step({ label, detail, state }: { label: string; detail: string; state: StepState }) {
  const icon = {
    done: <CheckCircle2Icon className="size-4 text-emerald-600" aria-hidden />,
    current: <Loader2Icon className="size-4 animate-spin text-sky-600" aria-hidden />,
    failed: <XCircleIcon className="size-4 text-destructive" aria-hidden />,
    upcoming: <CircleIcon className="size-4 text-muted-foreground/50" aria-hidden />,
  }[state];
  return (
    <li
      aria-current={state === 'current' ? 'step' : undefined}
      className={cn(
        'flex items-start gap-2 rounded-lg border p-3',
        state === 'current' && 'border-sky-500/50 bg-sky-500/5',
        state === 'failed' && 'border-destructive/40 bg-destructive/5',
        state === 'upcoming' && 'opacity-60',
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="grid">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
        <span className="sr-only">
          {
            {
              done: 'completed',
              current: 'in progress',
              failed: 'failed',
              upcoming: 'not started',
            }[state]
          }
        </span>
      </span>
    </li>
  );
}
