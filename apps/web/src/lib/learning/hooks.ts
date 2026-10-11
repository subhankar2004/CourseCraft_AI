'use client';

import {
  type LessonProgress,
  lessonDetailSchema,
  lessonProgressSchema,
  type MyCourseProgress,
  myCourseProgressSchema,
} from '@coursecraft/shared';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const lessonKey = (id: string) => ['lesson', id] as const;
export const courseProgressKey = (courseId: string) => ['learning', 'progress', courseId] as const;

/** A lesson with its notes, video and neighbours (admins can also open unpublished ones). */
export function useLesson(id: string) {
  return useQuery({
    queryKey: lessonKey(id),
    queryFn: () => api(`lessons/${id}`, { schema: lessonDetailSchema }),
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

/** Writes a save's result into the cached course progress, so other views stay current. */
export function storeLessonProgress(queryClient: QueryClient, saved: LessonProgress) {
  const { courseId, ...summary } = saved.course;
  queryClient.setQueryData<MyCourseProgress>(courseProgressKey(courseId), (current) =>
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
}
