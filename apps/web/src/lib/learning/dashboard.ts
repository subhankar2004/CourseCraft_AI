import type { MyCourse } from '@coursecraft/shared';
import { MIN_RESUME_SEC } from './playback';

/**
 * The student dashboard's choices (#37), kept free of React so they can be unit-tested.
 * `GET /me/courses` lists courses by latest activity, so the first unfinished one is "where you
 * left off".
 */

export interface ContinueTarget {
  course: MyCourse['course'];
  progress: MyCourse['progress'];
  lesson: { id: string; title: string; moduleTitle: string };
  /** Where the video resumes, when the lesson was left part-way (else it starts afresh). */
  resumeAtSec: number | null;
  /** False before any lesson of the course was opened. */
  started: boolean;
}

/**
 * Where to pick a course up: the lesson last open if it isn't completed (with its position),
 * otherwise the course's next lesson (SPEC §7.3). Null for a finished course.
 */
export function resumeLesson({
  lastLesson,
  next,
}: MyCourse): Pick<ContinueTarget, 'lesson' | 'resumeAtSec'> | null {
  if (!next) return null;
  if (lastLesson && lastLesson.status !== 'COMPLETED') {
    const { id, title, moduleTitle, lastPositionSec } = lastLesson;
    return {
      lesson: { id, title, moduleTitle },
      resumeAtSec: lastPositionSec >= MIN_RESUME_SEC ? lastPositionSec : null,
    };
  }
  return { lesson: next, resumeAtSec: null };
}

/**
 * "Continue where you left off": the most recently *studied* unfinished course (enrolling also
 * counts as activity in the list, but an untouched course shouldn't displace one in progress),
 * else the newest unfinished course to start. Null when every course is finished.
 */
export function continueTarget(courses: MyCourse[]): ContinueTarget | null {
  const unfinished = courses.filter((entry) => entry.next !== null);
  const entry = unfinished.find((candidate) => candidate.lastLesson !== null) ?? unfinished[0];
  const resume = entry && resumeLesson(entry);
  if (!entry || !resume) return null;
  return {
    course: entry.course,
    progress: entry.progress,
    ...resume,
    started: entry.lastLesson !== null,
  };
}

export interface CourseAction {
  label: 'Start' | 'Continue' | 'Review';
  href: string;
}

/** Each course card's button: start or continue where it was left, or review a finished one. */
export function courseAction(entry: MyCourse): CourseAction {
  const resume = resumeLesson(entry);
  if (!resume) return { label: 'Review', href: `/courses/${entry.course.slug}` };
  return {
    label: entry.lastLesson ? 'Continue' : 'Start',
    href: `/learn/${entry.course.slug}/${resume.lesson.id}`,
  };
}
