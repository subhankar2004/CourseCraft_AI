// @vitest-environment jsdom
import type { CompletedLesson, MyCourse } from '@coursecraft/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentDashboard } from './student-dashboard';

// Data hooks mocked: these tests are about what each state of the learner's data renders.
const state = vi.hoisted(() => ({
  courses: { isPending: false, isError: false, data: [] as unknown[], refetch: vi.fn() },
  completed: { isPending: false, isError: false, data: [] as unknown[] },
}));
vi.mock('@/lib/auth/hooks', () => ({ useMe: () => ({ data: { name: 'Asha' } }) }));
vi.mock('@/lib/learning/hooks', () => ({
  useMyCourses: () => state.courses,
  useCompletedLessons: () => state.completed,
}));
vi.mock('next/image', () => ({ default: () => null }));

const ref = (id: string) => ({ id, title: `Lesson ${id}`, moduleTitle: 'Basics' });
const sql: MyCourse = {
  course: {
    id: 'c1',
    slug: 'sql',
    title: 'Database Fundamentals',
    level: null,
    thumbnailUrl: null,
    domain: { slug: 'db', name: 'Databases' },
  },
  enrolledAt: '2026-10-11T10:00:00.000Z',
  progress: { completed: 1, total: 4, percent: 25 },
  lastLesson: {
    ...ref('b'),
    status: 'IN_PROGRESS',
    lastPositionSec: 754,
    studiedAt: '2026-10-11T11:00:00.000Z',
  },
  next: ref('b'),
};
const done: MyCourse = {
  ...sql,
  course: { ...sql.course, id: 'c2', slug: 'web', title: 'Web Basics' },
  progress: { completed: 2, total: 2, percent: 100 },
  next: null,
};
const completedLesson: CompletedLesson = {
  lessonId: 'a',
  title: 'Lesson a',
  moduleTitle: 'Basics',
  course: { id: 'c1', slug: 'sql', title: 'Database Fundamentals' },
  completedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
};

beforeEach(() => {
  state.courses = { isPending: false, isError: false, data: [], refetch: vi.fn() };
  state.completed = { isPending: false, isError: false, data: [] };
});
afterEach(cleanup);

describe('StudentDashboard', () => {
  it('invites a new learner to browse domains', () => {
    render(<StudentDashboard />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Welcome, Asha');
    expect(screen.getByRole('heading', { name: /haven.t enrolled/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse domains' }).getAttribute('href')).toBe(
      '/domains',
    );
  });

  it('shows where to continue, every course with its progress, and recent completions', () => {
    state.courses.data = [sql, done];
    state.completed.data = [completedLesson];
    render(<StudentDashboard />);
    expect(screen.getByText('2 courses · 3 lessons completed')).toBeTruthy();

    const resume = within(screen.getByRole('region', { name: 'Continue where you left off' }));
    expect(resume.getByText('Lesson b')).toBeTruthy();
    expect(resume.getByRole('link', { name: 'Resume at 12:34' }).getAttribute('href')).toBe(
      '/learn/sql/b',
    );

    const cards = within(screen.getByRole('region', { name: 'My courses' })).getAllByRole(
      'article',
    );
    expect(
      cards.map((card) => within(card).getByRole('progressbar').getAttribute('aria-valuenow')),
    ).toEqual(['25', '100']);
    expect(
      within(cards[1]!).getByRole('link', { name: 'Review Web Basics' }).getAttribute('href'),
    ).toBe('/courses/web');

    const recent = within(screen.getByRole('region', { name: 'Recently completed' }));
    expect(recent.getByRole('link').getAttribute('href')).toBe('/learn/sql/a');
    expect(recent.getByText('2 hours ago')).toBeTruthy();
  });

  it('says so when every course is finished', () => {
    state.courses.data = [done];
    render(<StudentDashboard />);
    expect(screen.getByText(/finished every course you enrolled in/)).toBeTruthy();
  });

  it('offers a retry when the courses cannot be loaded', () => {
    state.courses = { isPending: false, isError: true, data: [], refetch: vi.fn() };
    render(<StudentDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.courses.refetch).toHaveBeenCalled();
  });
});
