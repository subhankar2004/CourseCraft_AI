import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LessonView } from '@/components/learn/lesson-view';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Lesson' };

async function LessonContent({
  params,
}: Pick<PageProps<'/learn/[courseSlug]/[lessonId]'>, 'params'>) {
  const { courseSlug, lessonId } = await params;
  return <LessonView courseSlug={courseSlug} lessonId={lessonId} />;
}

/** The split-view lesson page (SPEC §10). Signed-in only (proxy.ts); data loads in the browser. */
export default function LessonPage({ params }: PageProps<'/learn/[courseSlug]/[lessonId]'>) {
  return (
    <Suspense fallback={<Skeleton className="m-4 aspect-video max-w-3xl rounded-xl lg:m-6" />}>
      <LessonContent params={params} />
    </Suspense>
  );
}
