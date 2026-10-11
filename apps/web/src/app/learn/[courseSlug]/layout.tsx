import { Suspense } from 'react';
import { CourseSidebar } from '@/components/learn/course-sidebar';

async function Sidebar({ params }: Pick<LayoutProps<'/learn/[courseSlug]'>, 'params'>) {
  const { courseSlug } = await params;
  return <CourseSidebar courseSlug={courseSlug} />;
}

/** The course's lesson tree beside every lesson; it stays mounted while moving between them. */
export default function LearnCourseLayout({
  children,
  params,
}: LayoutProps<'/learn/[courseSlug]'>) {
  return (
    <div className="lg:flex">
      <Suspense fallback={<div className="hidden w-72 shrink-0 border-r lg:block" />}>
        <Sidebar params={params} />
      </Suspense>
      <div className="min-w-0 lg:flex-1">{children}</div>
    </div>
  );
}
