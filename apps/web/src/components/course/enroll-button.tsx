'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PlayIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/auth/hooks';
import { courseProgressKey, enrollAndFindNext, useCourseProgress } from '@/lib/learning/hooks';
import { courseCta } from '@/lib/learning/navigation';

interface Props {
  courseId: string;
  courseSlug: string;
  /** For reviewing a finished course from the start. */
  firstLessonId: string | undefined;
}

/**
 * The course page's call to action (#36): sign in, enroll (then open the first lesson not yet
 * completed, from `GET /courses/:id/next`), start or continue at that lesson, or completed.
 */
export function EnrollButton({ courseId, courseSlug, firstLessonId }: Props) {
  const { data: user, isPending: userPending } = useMe();
  const progress = useCourseProgress(user ? courseId : undefined);
  const queryClient = useQueryClient();
  const router = useRouter();
  const enroll = useMutation({
    mutationFn: () => enrollAndFindNext(courseId),
    onSuccess: async ({ lesson }) => {
      await queryClient.invalidateQueries({ queryKey: courseProgressKey(courseId) });
      if (lesson) router.push(`/learn/${courseSlug}/${lesson.id}`);
    },
    onError: () => toast.error('Enrolling failed. Try again.'),
  });

  if (userPending) return <Skeleton className="h-10 w-44" />;
  if (!user) {
    return (
      <Button asChild size="lg">
        <Link href={`/login?next=${encodeURIComponent(`/courses/${courseSlug}`)}`}>
          Sign in to enroll
        </Link>
      </Button>
    );
  }
  if (progress.isError) {
    return (
      <Button size="lg" variant="outline" onClick={() => void progress.refetch()}>
        Couldn&apos;t load your progress. Retry
      </Button>
    );
  }

  if (!progress.data) return <Skeleton className="h-10 w-44" />;

  const cta = courseCta(progress.data);
  const { completed, total, percent } = progress.data.progress;
  if (cta.kind === 'enroll') {
    return (
      <Button size="lg" disabled={enroll.isPending} onClick={() => enroll.mutate()}>
        {enroll.isPending ? 'Enrolling…' : 'Enroll for free'}
      </Button>
    );
  }
  if (cta.kind === 'completed') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckIcon className="size-5" aria-hidden />
          Course completed
        </span>
        {firstLessonId && (
          <Button variant="outline" asChild>
            <Link href={`/learn/${courseSlug}/${firstLessonId}`}>Review from the start</Link>
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="grid justify-items-start gap-2">
      <Button size="lg" asChild>
        <Link href={`/learn/${courseSlug}/${cta.lesson.id}`}>
          <PlayIcon aria-hidden />
          {cta.kind === 'start' ? 'Start learning' : 'Continue learning'}
        </Link>
      </Button>
      <p className="text-sm text-muted-foreground">
        Next: {cta.lesson.title}
        {cta.kind === 'continue' && ` · ${completed} of ${total} lessons complete (${percent}%)`}
      </p>
    </div>
  );
}
