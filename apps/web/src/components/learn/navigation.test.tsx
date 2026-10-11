// @vitest-environment jsdom
import type { CourseDetail, MyCourseProgress } from '@coursecraft/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnrollButton } from '@/components/course/enroll-button';
import { CourseSidebar } from './course-sidebar';
import { LessonNav, UpNext } from './lesson-nav';

// Data hooks and routing are mocked: these tests are about what each state renders.
const state = vi.hoisted(() => ({
  outline: { isPending: false, isError: false, data: undefined as unknown },
  progress: { isPending: false, isError: false, data: undefined as unknown },
  user: { isPending: false, data: { id: 'u1' } as unknown },
  push: vi.fn(),
  enrollAndFindNext: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ lessonId: 'b' }),
  useRouter: () => ({ push: state.push }),
}));
vi.mock('@/lib/auth/hooks', () => ({ useMe: () => state.user }));
vi.mock('@/lib/learning/hooks', () => ({
  useCourseOutline: () => state.outline,
  useCourseProgress: () => ({ ...state.progress, refetch: vi.fn() }),
  courseProgressKey: (id: string) => ['learning', 'progress', id],
  enrollAndFindNext: state.enrollAndFindNext,
}));

const lesson = (id: string, order: number) => ({
  id,
  title: `Lesson ${id}`,
  order,
  readingTimeMin: 3,
  videoDurationSec: 600,
});
const course: CourseDetail = {
  id: 'course',
  slug: 'sql',
  title: 'Database Fundamentals',
  description: null,
  level: null,
  thumbnailUrl: null,
  lessonCount: 3,
  domain: { slug: 'db', name: 'Databases' },
  totalVideoSec: 1800,
  updatedAt: '2026-10-11T10:00:00.000Z',
  modules: [
    {
      id: 'm1',
      title: 'Basics',
      summary: null,
      order: 1,
      lessons: [lesson('a', 1), lesson('b', 2)],
    },
    { id: 'm2', title: 'Advanced', summary: null, order: 2, lessons: [lesson('c', 1)] },
  ],
};
const progress = (overrides: Partial<MyCourseProgress> = {}): MyCourseProgress => ({
  courseId: 'course',
  enrolled: true,
  enrolledAt: '2026-10-11T10:00:00.000Z',
  progress: { completed: 1, total: 3, percent: 33 },
  lessons: [
    { lessonId: 'a', status: 'COMPLETED', lastPositionSec: 600 },
    { lessonId: 'b', status: 'IN_PROGRESS', lastPositionSec: 120 },
    { lessonId: 'c', status: 'NOT_STARTED', lastPositionSec: 0 },
  ],
  next: { id: 'b', title: 'Lesson b', moduleTitle: 'Basics' },
  ...overrides,
});

function withQueryClient(ui: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  state.outline = { isPending: false, isError: false, data: course };
  state.progress = { isPending: false, isError: false, data: progress() };
  state.user = { isPending: false, data: { id: 'u1' } };
  // The sidebar must not call scrollIntoView: it moves the browser's sequential focus starting
  // point (the next Tab would skip the header). jsdom has none, so a spy stands in.
  Element.prototype.scrollIntoView = vi.fn() as never;
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('CourseSidebar', () => {
  it('lists every lesson with its status, the current one marked', () => {
    render(<CourseSidebar courseSlug="sql" />);
    const aside = screen.getByRole('complementary', { name: 'Course contents' });
    const links = within(aside).getAllByRole('link').slice(1); // after the course title
    expect(links.map((link) => link.textContent)).toEqual([
      'Completed: 1. Lesson a',
      'In progress: 2. Lesson b',
      'Not started: 3. Lesson c',
    ]);
    expect(links[1]!.getAttribute('aria-current')).toBe('page');
    expect(links[0]!.getAttribute('href')).toBe('/learn/sql/a');
    expect(within(aside).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33');
    expect(within(aside).getByText('1 of 3 lessons complete · 33%')).toBeTruthy();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('collapses, and remembers it', () => {
    render(<CourseSidebar courseSlug="sql" />);
    act(() => screen.getByRole('button', { name: 'Hide course contents' }).click());
    const toggle = screen.getByRole('button', { name: 'Show course contents' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('course-lesson-tree')!.hidden).toBe(true);
    expect(localStorage.getItem('coursecraft:lesson-sidebar-collapsed')).toBe('1');
    act(() => toggle.click());
  });

  it('stays out of the way when the course has no public outline (draft previews)', () => {
    state.outline = { isPending: false, isError: true, data: undefined };
    const { container } = render(<CourseSidebar courseSlug="draft" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('LessonNav', () => {
  const nav = (props: Partial<Parameters<typeof LessonNav>[0]> = {}) => {
    const onSetStatus = vi.fn();
    render(
      <LessonNav
        courseSlug="sql"
        prev={null}
        next={{ id: 'b', title: 'Lesson b' }}
        status="IN_PROGRESS"
        canTrack
        busy={false}
        onSetStatus={onSetStatus}
        {...props}
      />,
    );
    return onSetStatus;
  };

  it('links to the neighbours, disabled at the start', () => {
    nav();
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole('link', { name: 'Next lesson: Lesson b' }).getAttribute('href')).toBe(
      '/learn/sql/b',
    );
  });

  it('marks complete, and back', () => {
    const onSetStatus = nav();
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(onSetStatus).toHaveBeenCalledWith('COMPLETED');
    cleanup();
    const undo = nav({ status: 'COMPLETED' });
    expect(screen.getByText('Completed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as not complete' }));
    expect(undo).toHaveBeenCalledWith('IN_PROGRESS');
  });

  it('records nothing in a draft preview', () => {
    nav({ canTrack: false });
    expect(screen.queryByRole('button', { name: 'Mark complete' })).toBeNull();
  });
});

describe('UpNext', () => {
  it('offers the next lesson, then the course state after the last one', () => {
    render(
      <UpNext
        courseSlug="sql"
        courseTitle="SQL"
        next={{ id: 'c', title: 'Lesson c' }}
        remaining={undefined}
      />,
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe('/learn/sql/c');
    cleanup();

    render(
      <UpNext
        courseSlug="sql"
        courseTitle="SQL"
        next={null}
        remaining={{
          lesson: { id: 'a', title: 'Lesson a', moduleTitle: 'Basics' },
          courseCompleted: false,
        }}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Still to complete: Lesson a' }).getAttribute('href'),
    ).toBe('/learn/sql/a');
    cleanup();

    render(
      <UpNext
        courseSlug="sql"
        courseTitle="SQL"
        next={null}
        remaining={{ lesson: null, courseCompleted: true }}
      />,
    );
    expect(screen.getByText(/You.ve finished SQL/)).toBeTruthy();
  });
});

describe('EnrollButton', () => {
  const button = () =>
    render(withQueryClient(<EnrollButton courseId="course" courseSlug="sql" firstLessonId="a" />));

  it('asks signed-out visitors to sign in', () => {
    state.user = { isPending: false, data: null };
    button();
    expect(screen.getByRole('link', { name: 'Sign in to enroll' }).getAttribute('href')).toBe(
      '/login?next=%2Fcourses%2Fsql',
    );
  });

  it('enrolls, then opens the lesson the API says is next', async () => {
    state.progress.data = progress({ enrolled: false, enrolledAt: null });
    state.enrollAndFindNext.mockResolvedValue({
      lesson: { id: 'a', title: 'Lesson a', moduleTitle: 'Basics' },
      courseCompleted: false,
    });
    button();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enroll for free' })));
    expect(state.enrollAndFindNext).toHaveBeenCalledWith('course');
    expect(state.push).toHaveBeenCalledWith('/learn/sql/a');
  });

  it('continues at the next lesson, with the progress so far', () => {
    button();
    expect(screen.getByRole('link', { name: 'Continue learning' }).getAttribute('href')).toBe(
      '/learn/sql/b',
    );
    expect(screen.getByText('Next: Lesson b · 1 of 3 lessons complete (33%)')).toBeTruthy();
  });

  it('shows a finished course, with a way to review it', () => {
    state.progress.data = progress({ next: null });
    button();
    expect(screen.getByText('Course completed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review from the start' }).getAttribute('href')).toBe(
      '/learn/sql/a',
    );
  });
});
