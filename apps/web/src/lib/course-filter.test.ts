import type { CourseSummary } from '@coursecraft/shared';
import { describe, expect, it } from 'vitest';
import { filterCourses, parseCourseFilter } from './course-filter';

const course = (
  title: string,
  level: string | null,
  description: string | null = null,
): CourseSummary => ({
  id: title,
  slug: title.toLowerCase().replace(/\s+/g, '-'),
  title,
  description,
  level,
  thumbnailUrl: null,
  lessonCount: 1,
});

const courses = [
  course('Database Fundamentals', 'Beginner', 'SQL, relationships and normalizing a schema'),
  course('Query Optimisation', 'Advanced', 'Indexes and execution plans'),
  course('Résumé Writing for Engineers', 'Beginner'),
];

describe('filterCourses', () => {
  const titles = (q: string, level: CourseSummary['level'] = null) =>
    filterCourses(courses, { q, level: level as never }).map((c) => c.title);

  it('returns everything for an empty filter', () => {
    expect(titles('')).toHaveLength(3);
  });

  it('matches title and description, case-insensitively, all terms required', () => {
    expect(titles('sql')).toEqual(['Database Fundamentals']);
    expect(titles('INDEXES plans')).toEqual(['Query Optimisation']);
    expect(titles('sql plans')).toEqual([]);
  });

  it('ignores accents', () => {
    expect(titles('resume')).toEqual(['Résumé Writing for Engineers']);
  });

  it('filters by level and combines with search', () => {
    expect(titles('', 'Beginner')).toEqual([
      'Database Fundamentals',
      'Résumé Writing for Engineers',
    ]);
    expect(titles('database', 'Advanced')).toEqual([]);
  });
});

describe('parseCourseFilter', () => {
  it('reads known levels and trims the query', () => {
    expect(parseCourseFilter(new URLSearchParams('q=%20sql%20&level=Beginner'))).toEqual({
      q: 'sql',
      level: 'Beginner',
    });
  });

  it('drops unknown levels and caps the query length', () => {
    const filter = parseCourseFilter(new URLSearchParams(`level=Expert&q=${'x'.repeat(300)}`));
    expect(filter.level).toBeNull();
    expect(filter.q).toHaveLength(100);
  });
});
