'use client';

import {
  courseDetailSchema,
  enrollmentSchema,
  type LessonProgress,
  lessonDetailSchema,
  lessonProgressSchema,
  type MyCourseProgress,
  myCourseProgressSchema,
  nextLessonSchema,
  type ProgressStatus,
} from '@coursecraft/shared';
import { type QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const lessonKey = (id: string) => ['lesson', id] as const;
export const courseOutlineKey = (slug: string) => ['course', slug] as const;
export const courseProgressKey = (courseId: string) => ['learning', 'progress', courseId] as const;

/** A lesson with its notes, video and neighbours (admins can also open unpublished ones). */
export const lessonQuery = (id: string) =>
  queryOptions({
    queryKey: lessonKey(id),
    queryFn: () => api(`lessons/${id}`, { schema: lessonDetailSchema }),
  });

export function useLesson(id: string) {
  return useQuery(lessonQuery(id));
}

/** A published course's outline (the sidebar, lesson titles). 404 for unpublished courses. */
export function useCourseOutline(slug: string) {
  return useQuery({
    queryKey: courseOutlineKey(slug),
    queryFn: () => api(`courses/${slug}`, { schema: courseDetailSchema }),
  });
}

/**
 * The learner's progress in a course (resume positions, and the sidebar in #36). Always
 * refetched on mount, since another tab or device may have moved on. 404 for unpublished courses.
 */
export function useCourseProgress(courseId: string | undefined) {
  return useQuery({
    queryKey: courseProgressKey(courseId ?? ''),
    queryFn: () => api(`courses/${courseId}/progress`, { schema: myCourseProgressSchema }),
    enabled: courseId !== undefined,
    staleTime: 0,
  });
}

/**
 * `PUT /lessons/:id/progress` with the position only (the API applies SPEC §7.3: in progress,
 * completed at 90%). `keepalive` lets the request outlive the page when the learner leaves.
 */
export function saveLessonPosition(
  lessonId: string,
  lastPositionSec: number,
  keepalive = false,
): Promise<LessonProgress> {
  return api(`lessons/${lessonId}/progress`, {
    method: 'PUT',
    json: { lastPositionSec },
    keepalive,
    schema: lessonProgressSchema,
  });
}

/** "Mark complete" (or back to in progress), at the current position. */
export function setLessonStatus(
  lessonId: string,
  status: 'COMPLETED' | 'IN_PROGRESS',
  lastPositionSec: number,
): Promise<LessonProgress> {
  return api(`lessons/${lessonId}/progress`, {
    method: 'PUT',
    json: { status, lastPositionSec },
    schema: lessonProgressSchema,
  });
}

/** Enrolls (idempotent), then asks where to begin: the first lesson not completed. */
export async function enrollAndFindNext(courseId: string) {
  await api(`courses/${courseId}/enroll`, { method: 'POST', schema: enrollmentSchema });
  return api(`courses/${courseId}/next`, { schema: nextLessonSchema });
}

/**
 * Writes a save's result into the cached course progress, so other views (the sidebar) stay
 * current. Returns the lesson's previous status, to notice a completion. When the status
 * changed, the course's `next` lesson may have too, so progress is refetched.
 */
export function storeLessonProgress(
  queryClient: QueryClient,
  saved: LessonProgress,
): ProgressStatus | undefined {
  const { courseId, ...summary } = saved.course;
  const key = courseProgressKey(courseId);
  const before = queryClient
    .getQueryData<MyCourseProgress>(key)
    ?.lessons.find((lesson) => lesson.lessonId === saved.lessonId)?.status;
  queryClient.setQueryData<MyCourseProgress>(key, (current) =>
    current
      ? {
          ...current,
          progress: summary,
          lessons: current.lessons.map((lesson) =>
            lesson.lessonId === saved.lessonId
              ? { ...lesson, status: saved.status, lastPositionSec: saved.lastPositionSec }
              : lesson,
          ),
        }
      : current,
  );
  if (before !== saved.status) void queryClient.invalidateQueries({ queryKey: key });
  return before;
}
