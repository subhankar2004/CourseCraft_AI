import type { IngestionEvent, JobDetail, JobStage } from '@coursecraft/shared';

/** The stages the pipeline actually goes through (#27), in order, with admin-facing names. */
export const STEPS: { stage: JobStage; label: string; detail: string }[] = [
  { stage: 'METADATA', label: 'Video info', detail: 'Titles, durations, playlist' },
  { stage: 'TRANSCRIPT', label: 'Transcripts', detail: 'Captions, or Whisper when there are none' },
  { stage: 'NOTES', label: 'Lessons', detail: 'Notes, chunks and embeddings per video' },
  { stage: 'STRUCTURING', label: 'Course outline', detail: 'Modules and lesson order' },
  { stage: 'DONE', label: 'Ready', detail: 'Saved as a draft' },
];

export type StepState = 'done' | 'current' | 'upcoming' | 'failed';

/** Each step's state from the job's stage and status. */
export function stepStates(job: Pick<JobDetail, 'stage' | 'status'>): StepState[] {
  if (job.status === 'SUCCEEDED') return STEPS.map(() => 'done');
  const current = job.stage ? STEPS.findIndex((s) => s.stage === job.stage) : -1;
  return STEPS.map((_, index) => {
    if (current === -1) return index === 0 && job.status === 'RUNNING' ? 'current' : 'upcoming';
    if (index < current) return 'done';
    if (index === current) return job.status === 'FAILED' ? 'failed' : 'current';
    return 'upcoming';
  });
}

/**
 * Applies a live progress event to the job last received. The snapshot is authoritative; an
 * event updates status, stage, progress and (when it carries one) a single video.
 */
export function applyEvent(job: JobDetail, event: IngestionEvent): JobDetail {
  if (event.jobId !== job.id) return job;
  const videos = event.video
    ? job.videos.map((video) =>
        video.position === event.video!.position
          ? {
              ...video,
              status: event.video!.status,
              error: event.video!.error,
              title: event.video!.title ?? video.title,
            }
          : video,
      )
    : job.videos;
  return {
    ...job,
    status: event.status,
    stage: event.stage,
    progress: Math.max(event.status === 'QUEUED' ? 0 : job.progress, event.progress),
    error: event.error !== undefined ? event.error : job.error,
    videos,
  };
}

/**
 * Events only update what the page already knows. Re-read the full job when the stage changes
 * (e.g. the video list appears after METADATA) or an event mentions a video the page lacks.
 */
export function needsSnapshot(job: JobDetail, event: IngestionEvent): boolean {
  if (event.jobId !== job.id) return false;
  if (event.stage !== job.stage) return true;
  return event.video !== undefined && !job.videos.some((v) => v.position === event.video!.position);
}

/**
 * The video being worked on now: the worker handles one at a time, in order, so it is the first
 * one still waiting for the current stage. `null` when none is (or the job isn't running).
 */
export function currentVideoPosition(
  job: Pick<JobDetail, 'status' | 'stage' | 'videos'>,
): number | null {
  if (job.status !== 'RUNNING') return null;
  const waiting =
    job.stage === 'TRANSCRIPT' ? 'PENDING' : job.stage === 'NOTES' ? 'TRANSCRIBED' : null;
  return job.videos.find((v) => v.status === waiting)?.position ?? null;
}

/** True while the job may still change (the stream should stay open). */
export const isActive = (job: Pick<JobDetail, 'status'>) =>
  job.status === 'QUEUED' || job.status === 'RUNNING';

/** "Only the first 25 videos were used" when the metadata stage truncated the input. */
export function truncationNote(job: Pick<JobDetail, 'report'>): string | null {
  const report = job.report as { truncated?: unknown; maxVideos?: unknown } | null;
  return report?.truncated === true && typeof report.maxVideos === 'number'
    ? `Only the first ${report.maxVideos} videos were used (MAX_VIDEOS_PER_COURSE).`
    : null;
}
