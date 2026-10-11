'use client';

import type { CourseDetail, ProgressStatus } from '@coursecraft/shared';
import {
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  ListIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressBar } from './progress-bar';
import { useCourseOutline, useCourseProgress } from '@/lib/learning/hooks';
import { courseLessons, statusesOf } from '@/lib/learning/navigation';
import { cn } from '@/lib/utils';

// Collapsed or not, remembered per browser. Read through useSyncExternalStore so the server
// render (always expanded) and the first client render agree, then storage takes over.
const COLLAPSED_KEY = 'coursecraft:lesson-sidebar-collapsed';
const listeners = new Set<() => void>();
let collapsedInMemory: boolean | null = null; // when storage is blocked

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readCollapsed(): boolean {
  if (collapsedInMemory !== null) return collapsedInMemory;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  collapsedInMemory = collapsed;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // A convenience only: the in-memory value lasts until the page is reloaded.
  }
  listeners.forEach((listener) => listener());
}

const STATUS = {
  COMPLETED: { icon: CircleCheckIcon, label: 'Completed', className: 'text-emerald-600' },
  IN_PROGRESS: { icon: CircleDotIcon, label: 'In progress', className: 'text-primary' },
  NOT_STARTED: { icon: CircleIcon, label: 'Not started', className: 'text-muted-foreground/60' },
} satisfies Record<ProgressStatus, object>;

/**
 * The course's modules and lessons beside the lesson page (#36): completion ticks, the current
 * lesson highlighted, overall progress. Collapsible on large screens, a sheet on small ones.
 * Unpublished courses have no public outline (admin previews), so it simply isn't shown.
 */
export function CourseSidebar({ courseSlug }: { courseSlug: string }) {
  const { lessonId } = useParams<{ lessonId?: string }>();
  const outline = useCourseOutline(courseSlug);
  const progress = useCourseProgress(outline.data?.id);
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (outline.isError) return null;
  if (outline.isPending) return <SidebarPlaceholder />;

  const course = outline.data;
  const statuses = statusesOf(progress.data);
  const summary = progress.data?.progress;
  const tree = (onNavigate?: () => void) => (
    <LessonTree
      course={course}
      statuses={statuses}
      currentLessonId={lessonId}
      onNavigate={onNavigate}
    />
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-1.5 lg:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2">
              <ListIcon aria-hidden />
              Course contents
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 gap-0 p-0">
            <SheetHeader className="border-b">
              <SheetTitle>{course.title}</SheetTitle>
              {summary && <ProgressSummary {...summary} />}
            </SheetHeader>
            <div data-lesson-scroller className="overflow-y-auto">
              {tree(() => setSheetOpen(false))}
            </div>
          </SheetContent>
        </Sheet>
        {summary && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {summary.completed}/{summary.total} done
          </span>
        )}
      </div>

      <aside
        aria-label="Course contents"
        className={cn(
          'hidden shrink-0 flex-col border-r lg:sticky lg:top-14 lg:flex lg:h-[calc(100dvh-3.5rem)]',
          collapsed ? 'w-12' : 'w-72',
        )}
      >
        <div className={cn('flex items-start gap-1 border-b p-2', collapsed && 'justify-center')}>
          {!collapsed && (
            <div className="grid min-w-0 flex-1 gap-2 p-1">
              <Link
                href={`/courses/${course.slug}`}
                className="truncate text-sm font-semibold hover:underline"
              >
                {course.title}
              </Link>
              {summary && <ProgressSummary {...summary} />}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={!collapsed}
            aria-controls="course-lesson-tree"
            aria-label={collapsed ? 'Show course contents' : 'Hide course contents'}
            onClick={() => writeCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
          </Button>
        </div>
        <div
          id="course-lesson-tree"
          data-lesson-scroller
          hidden={collapsed}
          className="flex-1 overflow-y-auto"
        >
          {tree()}
        </div>
      </aside>
    </>
  );
}

function ProgressSummary({
  completed,
  total,
  percent,
}: Record<'completed' | 'total' | 'percent', number>) {
  return (
    <div className="grid gap-1">
      <ProgressBar percent={percent} label="Course progress" />
      <p className="text-xs text-muted-foreground">
        {completed} of {total} lessons complete · {percent}%
      </p>
    </div>
  );
}

function LessonTree({
  course,
  statuses,
  currentLessonId,
  onNavigate,
}: {
  course: CourseDetail;
  statuses: ReadonlyMap<string, ProgressStatus>;
  currentLessonId: string | undefined;
  onNavigate?: () => void;
}) {
  const current = useRef<HTMLAnchorElement>(null);
  // Keep the open lesson in view when moving through a long course. The list's own scroll
  // container is scrolled: `scrollIntoView` would also move the browser's sequential focus
  // starting point, so the next Tab would skip the header and land after this lesson.
  useEffect(() => {
    const link = current.current;
    const scroller = link?.closest<HTMLElement>('[data-lesson-scroller]');
    if (link && scroller) scrollWithin(scroller, link);
  }, [currentLessonId]);

  const numbers = new Map(
    courseLessons(course.modules).map((lesson) => [lesson.id, lesson.number]),
  );
  return (
    <nav aria-label="Lessons" className="grid gap-4 py-3">
      {course.modules.map((module, index) => (
        <section key={module.id} aria-labelledby={`module-${module.id}`}>
          <h3
            id={`module-${module.id}`}
            className="px-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            Module {index + 1} · {module.title}
          </h3>
          <ol>
            {module.lessons.map((lesson) => {
              const status = statuses.get(lesson.id) ?? 'NOT_STARTED';
              const { icon: Icon, label, className } = STATUS[status];
              const isCurrent = lesson.id === currentLessonId;
              return (
                <li key={lesson.id}>
                  <Link
                    ref={isCurrent ? current : undefined}
                    href={`/learn/${course.slug}/${lesson.id}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-start gap-2.5 border-l-2 px-4 py-2 text-sm hover:bg-muted',
                      isCurrent
                        ? 'border-primary bg-muted font-medium'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('mt-0.5 size-4 shrink-0', className)} aria-hidden />
                    <span className="sr-only">{label}: </span>
                    <span>
                      {numbers.get(lesson.id)}. {lesson.title}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </nav>
  );
}

/** Scrolls `scroller` (only) so that `target` is visible, a third of the way down if it moves. */
function scrollWithin(scroller: HTMLElement, target: HTMLElement) {
  const box = scroller.getBoundingClientRect();
  const item = target.getBoundingClientRect();
  if (item.top >= box.top && item.bottom <= box.bottom) return;
  scroller.scrollTop += item.top - box.top - box.height / 3;
}

function SidebarPlaceholder() {
  return (
    <div className="hidden w-72 shrink-0 gap-3 border-r p-4 lg:grid lg:content-start">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-1.5 w-full" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}
