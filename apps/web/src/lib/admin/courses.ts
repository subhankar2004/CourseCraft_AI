import type { AdminCourse, CourseStatus } from '@coursecraft/shared';

export type StatusFilter = CourseStatus | 'ALL';

export const STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: 'Draft',
  GENERATING: 'Generating',
  PUBLISHED: 'Published',
  FAILED: 'Failed',
};

/** Courses matching the status filter and a case-insensitive search on title and domain. */
export function filterCourses(
  courses: readonly AdminCourse[],
  status: StatusFilter,
  query: string,
): AdminCourse[] {
  const q = query.trim().toLowerCase();
  return courses.filter(
    (course) =>
      (status === 'ALL' || course.status === status) &&
      (!q ||
        course.title.toLowerCase().includes(q) ||
        course.domain.name.toLowerCase().includes(q)),
  );
}

/** How many courses have each status, plus the total, for the filter tabs. */
export function countByStatus(courses: readonly AdminCourse[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    ALL: courses.length,
    DRAFT: 0,
    GENERATING: 0,
    PUBLISHED: 0,
    FAILED: 0,
  };
  for (const course of courses) counts[course.status]++;
  return counts;
}

/** Poll while something is being generated, so progress moves without a reload. */
export const hasActiveGeneration = (courses: readonly AdminCourse[] | undefined) =>
  courses?.some((course) => course.status === 'GENERATING') ?? false;

/** Courses per domain (any status), to show what blocks deleting a domain. */
export function coursesPerDomain(courses: readonly AdminCourse[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const course of courses)
    counts.set(course.domain.id, (counts.get(course.domain.id) ?? 0) + 1);
  return counts;
}
