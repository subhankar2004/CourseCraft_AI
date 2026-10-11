import {
  COMPLETION_THRESHOLD,
  type CourseProgressSummary,
  type ProgressStatus,
  type UpdateProgressInput,
} from '@coursecraft/shared';

export interface ProgressState {
  status: ProgressStatus;
  lastPositionSec: number;
  completedAt: Date | null;
}

/**
 * The progress rules of SPEC §7.3, in one place:
 * - any update marks a lesson IN_PROGRESS (opening it sends position 0);
 * - it becomes COMPLETED when marked so, or once COMPLETION_THRESHOLD (90%) of the video is reached;
 * - a COMPLETED lesson stays completed when only the position changes (re-watching never undoes
 *   it); an explicit `status: IN_PROGRESS` does ("mark as not complete");
 * - the position is clamped to the video, and `completedAt` keeps the first completion time.
 */
export function nextProgress(
  current: ProgressState | null,
  input: UpdateProgressInput,
  videoDurationSec: number,
  now: Date,
): ProgressState {
  const lastPositionSec = Math.min(
    Math.max(input.lastPositionSec, 0),
    Math.max(videoDurationSec, 0),
  );
  const firstCompletion = current?.completedAt ?? now;
  if (input.status === 'COMPLETED') {
    return { status: 'COMPLETED', lastPositionSec, completedAt: firstCompletion };
  }
  if (input.status === 'IN_PROGRESS') {
    return { status: 'IN_PROGRESS', lastPositionSec, completedAt: null };
  }
  if (current?.status === 'COMPLETED') {
    return { status: 'COMPLETED', lastPositionSec, completedAt: current.completedAt ?? now };
  }
  const watchedEnough =
    videoDurationSec > 0 && lastPositionSec >= COMPLETION_THRESHOLD * videoDurationSec;
  return watchedEnough
    ? { status: 'COMPLETED', lastPositionSec, completedAt: firstCompletion }
    : { status: 'IN_PROGRESS', lastPositionSec, completedAt: null };
}

/** Course progress % = completed lessons / total lessons (SPEC §7.3). */
export function summarize(completed: number, total: number): CourseProgressSummary {
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}
