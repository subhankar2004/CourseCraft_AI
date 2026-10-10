import type { CourseSummary } from '@coursecraft/shared';
import { BookOpenIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** `eager` for cards in the first row: their thumbnail is often the page's LCP image. */
export function CourseCard({ course, eager = false }: { course: CourseSummary; eager?: boolean }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card className="h-full overflow-hidden pt-0 transition-colors group-hover:border-primary/40">
        <div className="relative aspect-video bg-muted">
          {course.thumbnailUrl ? (
            <Image
              src={course.thumbnailUrl}
              alt=""
              fill
              loading={eager ? 'eager' : 'lazy'}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <BookOpenIcon
              className="absolute inset-0 m-auto size-10 text-muted-foreground"
              aria-hidden
            />
          )}
        </div>
        <CardHeader>
          <CardTitle className="line-clamp-2">{course.title}</CardTitle>
          {course.description && (
            <CardDescription className="line-clamp-3">{course.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="mt-auto flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
          {course.level && (
            <span className="rounded-full bg-secondary px-2 py-0.5">{course.level}</span>
          )}
          <span className="rounded-full bg-secondary px-2 py-0.5">
            {course.lessonCount} lesson{course.lessonCount === 1 ? '' : 's'}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
