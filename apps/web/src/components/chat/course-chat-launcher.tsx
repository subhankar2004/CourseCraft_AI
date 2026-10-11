'use client';

import { useMe } from '@/lib/auth/hooks';
import { useCourseProgress } from '@/lib/learning/hooks';
import { CourseChat } from './course-chat';

/**
 * The assistant on the course page: only for signed-in students enrolled in the course (the API
 * answers others with 403). Visitors see the Enroll call to action instead.
 */
export function CourseChatLauncher({
  courseId,
  courseSlug,
}: {
  courseId: string;
  courseSlug: string;
}) {
  const { data: user } = useMe();
  const progress = useCourseProgress(user ? courseId : undefined);
  if (!user || !progress.data?.enrolled) return null;
  return <CourseChat courseId={courseId} courseSlug={courseSlug} />;
}
