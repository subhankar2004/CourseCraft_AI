'use client';

import { COURSE_LEVELS, type CourseLevel, type CourseSummary } from '@coursecraft/shared';
import { SearchIcon, XIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CourseCard } from '@/components/catalog/course-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { filterCourses, parseCourseFilter } from '@/lib/course-filter';
import { cn } from '@/lib/utils';

/**
 * Search and level filter over a domain's published courses. Runs in the browser (the list is
 * small and already loaded), and keeps the state in the URL so filtered views can be shared.
 */
export function CourseBrowser({ courses }: { courses: CourseSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = parseCourseFilter(searchParams);
  const [query, setQuery] = useState(filter.q);

  const updateUrl = (next: { q?: string; level?: CourseLevel | null }) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Debounce typing before writing it to the URL.
  useEffect(() => {
    if (query.trim() === filter.q) return;
    const timer = setTimeout(() => updateUrl({ q: query.trim() }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateUrl changes every render
  }, [query, filter.q]);

  const visible = filterCourses(courses, filter); // small list; no memoisation needed
  const filtering = Boolean(filter.q || filter.level);

  if (courses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        No courses in this domain yet. New courses are added regularly. Check back soon.
      </p>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
            className="pl-8"
          />
        </div>
        <div role="group" aria-label="Filter by level" className="flex flex-wrap gap-2">
          {[null, ...COURSE_LEVELS].map((level) => (
            <Button
              key={level ?? 'all'}
              size="sm"
              variant={filter.level === level ? 'default' : 'outline'}
              aria-pressed={filter.level === level}
              onClick={() => updateUrl({ level })}
            >
              {level ?? 'All levels'}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {visible.length} of {courses.length} course{courses.length === 1 ? '' : 's'}
      </p>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">No courses match your filters.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setQuery('');
              updateUrl({ q: '', level: null });
            }}
          >
            <XIcon /> Clear filters
          </Button>
        </div>
      ) : (
        <ul className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', filtering && 'min-h-40')}>
          {visible.map((course, index) => (
            <li key={course.id}>
              <CourseCard course={course} eager={index < 3} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
