import { COURSE_LEVELS, type CourseLevel, type CourseSummary } from '@coursecraft/shared';

export interface CourseFilter {
  q: string;
  level: CourseLevel | null;
}

/** Reads `?q=` and `?level=` from the URL, ignoring unknown levels. */
export function parseCourseFilter(params: { get(name: string): string | null }): CourseFilter {
  const level = params.get('level');
  return {
    q: (params.get('q') ?? '').trim().slice(0, 100),
    level: COURSE_LEVELS.includes(level as CourseLevel) ? (level as CourseLevel) : null,
  };
}

/** Case- and accent-insensitive match on title and description, plus an optional level. */
export function filterCourses<T extends CourseSummary>(courses: T[], filter: CourseFilter): T[] {
  const fold = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const terms = fold(filter.q).split(/\s+/).filter(Boolean);
  return courses.filter((course) => {
    if (filter.level && course.level !== filter.level) return false;
    const haystack = fold(`${course.title} ${course.description ?? ''}`);
    return terms.every((term) => haystack.includes(term));
  });
}
