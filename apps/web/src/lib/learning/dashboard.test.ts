import type { MyCourse } from '@coursecraft/shared';
import { describe, expect, it } from 'vitest';
import { continueTarget, courseAction } from './dashboard';

const ref = (id: string) => ({ id, title: `Lesson ${id}`, moduleTitle: 'M1' });

function course(slug: string, overrides: Partial<MyCourse> = {}): MyCourse {
  return {
    course: {
      id: slug,
      slug,
      title: `Course ${slug}`,
      level: null,
      thumbnailUrl: null,
      domain: { slug: 'db', name: 'Databases' },
    },
    enrolledAt: '2026-10-11T10:00:00.000Z',
    progress: { completed: 0, total: 3, percent: 0 },
    lastLesson: null,
    next: ref('a'),
    ...overrides,
  };
}

const last = (id: string, status: 'IN_PROGRESS' | 'COMPLETED', lastPositionSec = 0) => ({
  ...ref(id),
  status,
  lastPositionSec,
  studiedAt: '2026-10-11T11:00:00.000Z',
});

describe('continueTarget', () => {
  it('resumes the lesson left part-way, at its position', () => {
    const target = continueTarget([
      course('sql', { lastLesson: last('c', 'IN_PROGRESS', 754.2), next: ref('b') }),
    ]);
    expect(target).toMatchObject({ lesson: { id: 'c' }, resumeAtSec: 754.2, started: true });
  });

  it('moves on to the next lesson when the last one was completed', () => {
    const target = continueTarget([
      course('sql', { lastLesson: last('a', 'COMPLETED', 600), next: ref('b') }),
    ]);
    expect(target).toMatchObject({ lesson: { id: 'b' }, resumeAtSec: null, started: true });
  });

  it('does not resume a barely-started video', () => {
    const target = continueTarget([course('sql', { lastLesson: last('a', 'IN_PROGRESS', 3) })]);
    expect(target?.resumeAtSec).toBeNull();
  });

  it('prefers a course being studied over one only just enrolled in', () => {
    const target = continueTarget([
      course('enrolled-just-now'),
      course('sql', { lastLesson: last('b', 'IN_PROGRESS', 60), next: ref('b') }),
    ]);
    expect(target).toMatchObject({ course: { slug: 'sql' }, lesson: { id: 'b' }, started: true });
  });

  it('skips finished courses, and starts a course never opened', () => {
    const target = continueTarget([
      course('done', { next: null, lastLesson: last('z', 'COMPLETED') }),
      course('new'),
    ]);
    expect(target).toMatchObject({ course: { slug: 'new' }, lesson: { id: 'a' }, started: false });
    expect(continueTarget([course('done', { next: null })])).toBeNull();
    expect(continueTarget([])).toBeNull();
  });
});

describe('courseAction', () => {
  it('starts, continues or reviews', () => {
    expect(courseAction(course('sql'))).toEqual({ label: 'Start', href: '/learn/sql/a' });
    expect(
      courseAction(course('sql', { lastLesson: last('a', 'COMPLETED'), next: ref('b') })),
    ).toEqual({ label: 'Continue', href: '/learn/sql/b' });
    expect(
      courseAction(course('sql', { lastLesson: last('c', 'IN_PROGRESS', 90), next: ref('b') })),
    ).toEqual({ label: 'Continue', href: '/learn/sql/c' }); // same lesson as the continue card
    expect(courseAction(course('sql', { next: null }))).toEqual({
      label: 'Review',
      href: '/courses/sql',
    });
  });
});
