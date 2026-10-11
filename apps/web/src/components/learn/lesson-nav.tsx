import type { NextLesson, ProgressStatus } from '@coursecraft/shared';
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PartyPopperIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface Neighbour {
  id: string;
  /** Unknown while the course outline loads (or for unpublished previews). */
  title?: string;
}

const lessonHref = (courseSlug: string, lessonId: string) => `/learn/${courseSlug}/${lessonId}`;

/** Previous / mark complete / next, under the lesson title (#36). */
export function LessonNav({
  courseSlug,
  prev,
  next,
  status,
  canTrack,
  busy,
  onSetStatus,
}: {
  courseSlug: string;
  prev: Neighbour | null;
  next: Neighbour | null;
  status: ProgressStatus;
  /** False for previews of unpublished courses: nothing is recorded. */
  canTrack: boolean;
  busy: boolean;
  onSetStatus: (status: 'COMPLETED' | 'IN_PROGRESS') => void;
}) {
  const completed = status === 'COMPLETED';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {prev ? (
        <Button variant="outline" size="sm" asChild>
          <Link
            href={lessonHref(courseSlug, prev.id)}
            aria-label={prev.title ? `Previous lesson: ${prev.title}` : 'Previous lesson'}
          >
            <ChevronLeftIcon aria-hidden />
            Previous
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          <ChevronLeftIcon aria-hidden />
          Previous
        </Button>
      )}
      {canTrack &&
        (completed ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckIcon className="size-4" aria-hidden />
              Completed
            </span>
            <Button
              variant="link"
              size="sm"
              className="h-auto px-1 text-muted-foreground"
              disabled={busy}
              onClick={() => onSetStatus('IN_PROGRESS')}
            >
              Mark as not complete
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onSetStatus('COMPLETED')}
          >
            <CheckIcon aria-hidden />
            Mark complete
          </Button>
        ))}
      {next && (
        <Button size="sm" asChild className="ml-auto">
          <Link
            href={lessonHref(courseSlug, next.id)}
            aria-label={next.title ? `Next lesson: ${next.title}` : 'Next lesson'}
          >
            Next
            <ChevronRightIcon aria-hidden />
          </Link>
        </Button>
      )}
    </div>
  );
}

/**
 * The end of the notes: the next lesson; or, after the last one, the course's state: finished,
 * or which lesson is still left (the API's "next", SPEC §7.3).
 */
export function UpNext({
  courseSlug,
  courseTitle,
  next,
  remaining,
}: {
  courseSlug: string;
  courseTitle: string;
  next: Neighbour | null;
  /** The learner's progress in the course; undefined for previews. */
  remaining: NextLesson | undefined;
}) {
  if (next) {
    return (
      <Link
        href={lessonHref(courseSlug, next.id)}
        className="group flex items-center justify-between gap-4 rounded-xl border p-4 hover:bg-muted"
      >
        <span className="grid gap-0.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Up next
          </span>
          <span className="font-medium">{next.title ?? 'Next lesson'}</span>
        </span>
        <ArrowRightIcon
          className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    );
  }
  if (remaining?.courseCompleted) {
    return (
      <div className="grid justify-items-start gap-2 rounded-xl border border-emerald-600/30 bg-emerald-600/5 p-4">
        <p className="flex items-center gap-2 font-medium">
          <PartyPopperIcon className="size-5 text-emerald-600" aria-hidden />
          You&apos;ve finished {courseTitle}.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/courses/${courseSlug}`}>Back to the course</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="grid justify-items-start gap-2 rounded-xl border p-4">
      <p className="text-sm">This is the last lesson of the course.</p>
      {remaining?.lesson ? (
        <Button size="sm" asChild>
          <Link href={lessonHref(courseSlug, remaining.lesson.id)}>
            Still to complete: {remaining.lesson.title}
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/courses/${courseSlug}`}>Back to the course</Link>
        </Button>
      )}
    </div>
  );
}
