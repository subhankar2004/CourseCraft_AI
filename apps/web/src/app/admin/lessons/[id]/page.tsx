import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LessonEditor } from '@/components/admin/lesson-editor';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Edit lesson · Admin' };

async function EditorContent({ params }: Pick<PageProps<'/admin/lessons/[id]'>, 'params'>) {
  const { id } = await params;
  return <LessonEditor lessonId={id} />;
}

export default function EditLessonPage({ params }: PageProps<'/admin/lessons/[id]'>) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EditorContent params={params} />
    </Suspense>
  );
}
