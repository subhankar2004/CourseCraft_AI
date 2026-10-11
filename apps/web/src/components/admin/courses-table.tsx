'use client';

import type { AdminCourse } from '@coursecraft/shared';
import { SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  countByStatus,
  filterCourses,
  STATUS_LABELS,
  type StatusFilter,
} from '@/lib/admin/courses';
import { useAdminCourses } from '@/lib/admin/hooks';
import { formatRelative, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatusBadge } from './status-badge';

const FILTERS: StatusFilter[] = ['ALL', 'DRAFT', 'GENERATING', 'PUBLISHED', 'FAILED'];

export function CoursesTable() {
  const { data: courses, isPending, isError, refetch } = useAdminCourses();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [query, setQuery] = useState('');

  if (isPending) return <TableSkeleton />;
  if (isError) {
    return (
      <div role="alert" className="rounded-lg border p-6 text-sm">
        <p>Could not load courses.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const counts = countByStatus(courses);
  const visible = filterCourses(courses, status, query);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => (
            <Button
              key={filter}
              size="sm"
              variant={status === filter ? 'secondary' : 'ghost'}
              aria-pressed={status === filter}
              onClick={() => setStatus(filter)}
            >
              {filter === 'ALL' ? 'All' : STATUS_LABELS[filter]}
              <span className="text-muted-foreground tabular-nums">{counts[filter]}</span>
            </Button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search title or domain"
            aria-label="Search courses"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {courses.length === 0
            ? 'No courses yet. Generated courses appear here as drafts.'
            : 'No courses match these filters.'}
        </p>
      ) : (
        // `relative`: absolutely positioned descendants (sr-only labels) are clipped here too.
        <div className="relative overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">All courses</caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Course
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Domain
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Content
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((course) => (
                <CourseRow key={course.id} course={course} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CourseRow({ course }: { course: AdminCourse }) {
  const job = course.latestJob;
  return (
    <tr className="align-top">
      <td className="max-w-80 px-3 py-3">
        <Link href={`/admin/courses/${course.id}`} className="font-medium hover:underline">
          {course.title}
        </Link>
        {course.level && <p className="text-xs text-muted-foreground">{course.level}</p>}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">{course.domain.name}</td>
      <td className="px-3 py-3">
        <StatusBadge status={course.status} />
        {course.status === 'GENERATING' && job && (
          <div className="mt-2 w-36">
            <div
              role="progressbar"
              aria-label={`Generation progress for ${course.title}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={job.progress}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-sky-500 transition-[width]"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {job.stage ? `${job.stage.toLowerCase()} · ` : ''}
              {job.progress}%{job.status === 'QUEUED' ? ' · waiting' : ''}
            </p>
          </div>
        )}
        {course.status === 'FAILED' && job?.error && (
          <p className="mt-1 max-w-56 truncate text-xs text-destructive" title={job.error}>
            {job.error}
          </p>
        )}
        {job && (course.status === 'GENERATING' || course.status === 'FAILED') && (
          <Link href={`/admin/jobs/${job.id}`} className="mt-1 inline-block text-xs underline">
            {course.status === 'FAILED' ? 'Details and retry' : 'View progress'}
          </Link>
        )}
      </td>
      <td
        className={cn(
          'px-3 py-3 whitespace-nowrap',
          course.lessonCount === 0 && 'text-muted-foreground',
        )}
      >
        {course.lessonCount === 0
          ? '—'
          : `${plural(course.moduleCount, 'module')}, ${plural(course.lessonCount, 'lesson')}`}
      </td>
      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
        <time dateTime={course.updatedAt} title={new Date(course.updatedAt).toLocaleString()}>
          {formatRelative(course.updatedAt)}
        </time>
      </td>
    </tr>
  );
}

function TableSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading courses">
      <Skeleton className="h-8 w-full max-w-md" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
