import type { ModuleOutline, MyCourseProgress, ProgressStatus } from '@coursecraft/shared';

/**
 * Moving through a course (#36), kept free of React so it can be unit-tested: lesson positions
 * for labels, statuses for the sidebar, and what the course page's call to action should say.
 */

export interface LessonPlace {
  id: string;
  title: string;
  moduleTitle: string;
  /** 1-based position in the whole course. */
  number: number;
}

/** Every lesson in course order (module order, then lesson order), as the API sorts them. */
export function courseLessons(modules: ModuleOutline[]): LessonPlace[] {
  return modules
    .flatMap((module) =>
      module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        moduleTitle: module.title,
      })),
    )
    .map((lesson, index) => ({ ...lesson, number: index + 1 }));
}

/** Each lesson's status; lessons without a row haven't been started. */
export function statusesOf(progress: MyCourseProgress | undefined): Map<string, ProgressStatus> {
  return new Map(progress?.lessons.map((lesson) => [lesson.lessonId, lesson.status]) ?? []);
}

export type CourseCta =
  | { kind: 'enroll' }
  | { kind: 'start' | 'continue'; lesson: { id: string; title: string } }
  | { kind: 'completed' };

/**
 * The course page's button: enroll; then start or continue at the next lesson (SPEC §7.3, the
 * first one not completed); or, when everything is done, a completed state.
 */
export function courseCta(progress: MyCourseProgress): CourseCta {
  if (!progress.enrolled) return { kind: 'enroll' };
  if (!progress.next) return { kind: 'completed' };
  const started = progress.lessons.some((lesson) => lesson.status !== 'NOT_STARTED');
  return { kind: started ? 'continue' : 'start', lesson: progress.next };
}
