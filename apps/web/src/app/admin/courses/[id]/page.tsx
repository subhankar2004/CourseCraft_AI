import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CourseReview } from '@/components/admin/course-review';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Review course · Admin' };

async function ReviewContent({ params }: Pick<PageProps<'/admin/courses/[id]'>, 'params'>) {
  const { id } = await params;
  return <CourseReview courseId={id} />;
}

export default function CourseReviewPage({ params }: PageProps<'/admin/courses/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ReviewContent params={params} />
    </Suspense>
  );
}
