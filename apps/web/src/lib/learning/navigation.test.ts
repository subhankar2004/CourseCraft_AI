import type { ModuleOutline, MyCourseProgress } from '@coursecraft/shared';
import { describe, expect, it } from 'vitest';
import { courseCta, courseLessons, statusesOf } from './navigation';

const lesson = (id: string, order: number) => ({
  id,
  title: `Lesson ${id}`,
  order,
  readingTimeMin: 3,
  videoDurationSec: 600,
});
const modules: ModuleOutline[] = [
  { id: 'm1', title: 'Basics', summary: null, order: 1, lessons: [lesson('a', 1), lesson('b', 2)] },
  { id: 'm2', title: 'Advanced', summary: null, order: 2, lessons: [lesson('c', 1)] },
];

function progress(overrides: Partial<MyCourseProgress> = {}): MyCourseProgress {
  return {
    courseId: 'course',
    enrolled: true,
    enrolledAt: '2026-10-11T10:00:00.000Z',
    progress: { completed: 0, total: 3, percent: 0 },
    lessons: ['a', 'b', 'c'].map((lessonId) => ({
      lessonId,
      status: 'NOT_STARTED' as const,
      lastPositionSec: 0,
    })),
    next: { id: 'a', title: 'Lesson a', moduleTitle: 'Basics' },
    ...overrides,
  };
}

describe('courseLessons', () => {
  it('numbers lessons across modules in course order', () => {
    expect(courseLessons(modules)).toEqual([
      { id: 'a', title: 'Lesson a', moduleTitle: 'Basics', number: 1 },
      { id: 'b', title: 'Lesson b', moduleTitle: 'Basics', number: 2 },
      { id: 'c', title: 'Lesson c', moduleTitle: 'Advanced', number: 3 },
    ]);
  });
});

describe('statusesOf', () => {
  it('maps lessons to their status, empty without progress', () => {
    const statuses = statusesOf(
      progress({
        lessons: [{ lessonId: 'a', status: 'COMPLETED', lastPositionSec: 600 }],
      }),
    );
    expect(statuses.get('a')).toBe('COMPLETED');
    expect(statuses.get('b')).toBeUndefined();
    expect(statusesOf(undefined).size).toBe(0);
  });
});

describe('courseCta', () => {
  it('asks to enroll first', () => {
    expect(courseCta(progress({ enrolled: false, enrolledAt: null }))).toEqual({ kind: 'enroll' });
  });

  it('starts at the first lesson when nothing has been studied', () => {
    expect(courseCta(progress())).toEqual({
      kind: 'start',
      lesson: { id: 'a', title: 'Lesson a', moduleTitle: 'Basics' },
    });
  });

  it('continues at the next lesson once something was studied', () => {
    const cta = courseCta(
      progress({
        lessons: [
          { lessonId: 'a', status: 'COMPLETED', lastPositionSec: 600 },
          { lessonId: 'b', status: 'IN_PROGRESS', lastPositionSec: 120 },
          { lessonId: 'c', status: 'NOT_STARTED', lastPositionSec: 0 },
        ],
        next: { id: 'b', title: 'Lesson b', moduleTitle: 'Basics' },
      }),
    );
    expect(cta).toMatchObject({ kind: 'continue', lesson: { id: 'b' } });
  });

  it('is completed when no lesson is left', () => {
    expect(courseCta(progress({ next: null }))).toEqual({ kind: 'completed' });
  });
});
