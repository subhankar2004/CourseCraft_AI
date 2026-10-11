import type { Metadata } from 'next';
import { Suspense } from 'react';
import { JobProgressView } from '@/components/admin/job-progress-view';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Generation progress · Admin' };

/** Live progress of a generation job; refresh-safe, so the admin can leave and come back. */
async function JobContent({ params }: Pick<PageProps<'/admin/jobs/[id]'>, 'params'>) {
  const { id } = await params;
  return <JobProgressView jobId={id} />;
}

export default function JobPage({ params }: PageProps<'/admin/jobs/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <JobContent params={params} />
    </Suspense>
  );
}
