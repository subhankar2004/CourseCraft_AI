'use client';

import { formatTimestamp, type MyCourse } from '@coursecraft/shared';
import { BookOpenIcon, CircleCheckIcon, CompassIcon, PlayIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProgressBar } from '@/components/learn/progress-bar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMe } from '@/lib/auth/hooks';
import { formatRelative, plural } from '@/lib/format';
import { continueTarget, courseAction } from '@/lib/learning/dashboard';
import { useCompletedLessons, useMyCourses } from '@/lib/learning/hooks';

/**
 * `/dashboard` (#37): where the learner left off, their courses with progress, and the lessons
 * they finished most recently. Everything comes from the API, so it reflects real progress.
 */
export function StudentDashboard() {
  const { data: user } = useMe();
  const courses = useMyCourses();
  const completed = useCompletedLessons();

  const heading = (
    <header className="grid gap-1">
      <h1 className="text-3xl font-bold tracking-tight">
        {user
          ? `${courses.data?.length ? 'Welcome back' : 'Welcome'}, ${user.name}`
          : 'My learning'}
      </h1>
      {courses.data && courses.data.length > 0 && (
        <p className="text-muted-foreground">
          {plural(courses.data.length, 'course')} ·{' '}
          {plural(
            courses.data.reduce((sum, entry) => sum + entry.progress.completed, 0),
            'lesson',
          )}{' '}
          completed
        </p>
      )}
    </header>
  );

  if (courses.isPending) {
    return (
      <div className="grid gap-8">
        {heading}
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (courses.isError) {
    return (
      <div className="grid justify-items-start gap-4">
        {heading}
        <p className="text-muted-foreground">Your courses could not be loaded.</p>
        <Button onClick={() => void courses.refetch()}>Try again</Button>
      </div>
    );
  }
  if (courses.data.length === 0) {
    return (
      <div className="grid gap-8">
        {heading}
        <section className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <CompassIcon className="size-10 text-muted-foreground" aria-hidden />
          <h2 className="text-xl font-semibold">You haven&apos;t enrolled in a course yet</h2>
          <p className="max-w-md text-muted-foreground">
            Pick a domain, open a course and press “Enroll for free”. Your progress shows up here.
          </p>
          <Button asChild>
            <Link href="/domains">Browse domains</Link>
          </Button>
        </section>
      </div>
    );
  }

  const target = continueTarget(courses.data);
  return (
    <div className="grid gap-10">
      {heading}
      {target ? (
        <ContinueCard target={target} />
      ) : (
        <p className="flex items-center gap-2 rounded-xl border p-4">
          <CircleCheckIcon className="size-5 text-emerald-600" aria-hidden />
          You&apos;ve finished every course you enrolled in.{' '}
          <Link href="/domains" className="underline underline-offset-4">
            Find another one
          </Link>
        </p>
      )}
      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <Section id="my-courses" title="My courses">
          <ul className="grid gap-4 sm:grid-cols-2">
            {courses.data.map((entry) => (
              <li key={entry.course.id}>
                <CourseCard entry={entry} />
              </li>
            ))}
          </ul>
        </Section>
        <Section id="recently-completed" title="Recently completed">
          {completed.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : completed.isError ? (
            <p className="text-sm text-muted-foreground">Could not be loaded.</p>
          ) : completed.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Lessons you complete will be listed here.
            </p>
          ) : (
            <ol className="grid gap-1">
              {completed.data.map((lesson) => (
                <li key={lesson.lessonId}>
                  <Link
                    href={`/learn/${lesson.course.slug}/${lesson.lessonId}`}
                    className="flex gap-2.5 rounded-md p-2 hover:bg-muted"
                  >
                    <CircleCheckIcon
                      className="mt-0.5 size-4 shrink-0 text-emerald-600"
                      aria-hidden
                    />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">{lesson.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {lesson.course.title} ·{' '}
                        <time dateTime={lesson.completedAt}>
                          {formatRelative(lesson.completedAt)}
                        </time>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid content-start gap-4">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ContinueCard({ target }: { target: NonNullable<ReturnType<typeof continueTarget>> }) {
  const { course, progress, lesson, resumeAtSec, started } = target;
  return (
    <section
      aria-labelledby="continue"
      className="grid gap-5 rounded-xl border bg-muted/40 p-5 sm:grid-cols-[12rem_1fr] sm:items-center"
    >
      <Thumbnail course={course} className="hidden sm:block" />
      <div className="grid gap-3">
        <h2 id="continue" className="text-sm font-medium text-muted-foreground">
          {started ? 'Continue where you left off' : 'Ready to start'}
        </h2>
        <div className="grid gap-0.5">
          <p className="text-lg font-semibold">{lesson.title}</p>
          <p className="text-sm text-muted-foreground">
            {course.title} · {lesson.moduleTitle}
          </p>
        </div>
        <div className="grid max-w-sm gap-1">
          <ProgressBar percent={progress.percent} label={`${course.title} progress`} />
          <p className="text-xs text-muted-foreground">
            {progress.completed} of {progress.total} lessons complete · {progress.percent}%
          </p>
        </div>
        <div>
          <Button asChild>
            <Link href={`/learn/${course.slug}/${lesson.id}`}>
              <PlayIcon aria-hidden />
              {resumeAtSec !== null
                ? `Resume at ${formatTimestamp(Math.floor(resumeAtSec))}`
                : started
                  ? 'Continue'
                  : 'Start the course'}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function CourseCard({ entry }: { entry: MyCourse }) {
  const { course, progress, next } = entry;
  const action = courseAction(entry);
  return (
    <article className="grid h-full grid-rows-[auto_1fr] overflow-hidden rounded-xl border">
      <Thumbnail course={course} className="rounded-none border-0 border-b" />
      <div className="grid content-between gap-4 p-4">
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">{course.domain.name}</p>
          <h3 className="font-semibold">
            <Link href={`/courses/${course.slug}`} className="hover:underline">
              {course.title}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            {next ? `Next: ${next.title}` : 'Completed'}
          </p>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <ProgressBar percent={progress.percent} label={`${course.title} progress`} />
            <p className="text-xs text-muted-foreground">
              {progress.completed} of {progress.total} lessons · {progress.percent}%
            </p>
          </div>
          <Button variant={action.label === 'Review' ? 'outline' : 'default'} size="sm" asChild>
            <Link href={action.href} aria-label={`${action.label} ${course.title}`}>
              {action.label}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function Thumbnail({ course, className }: { course: MyCourse['course']; className?: string }) {
  return (
    <div
      className={cn('relative aspect-video overflow-hidden rounded-lg border bg-muted', className)}
    >
      {course.thumbnailUrl ? (
        <Image
          src={course.thumbnailUrl}
          alt=""
          fill
          sizes="(min-width: 640px) 24rem, 100vw"
          className="object-cover"
        />
      ) : (
        <BookOpenIcon
          className="absolute inset-0 m-auto size-8 text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  );
}
