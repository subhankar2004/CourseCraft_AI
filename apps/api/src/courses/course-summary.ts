import type { CourseSummary } from '@coursecraft/shared';
import { CourseStatus, type Prisma } from '../generated/prisma/client.js';

/** Only published courses are ever visible to the public catalog. */
export const PUBLISHED = { status: CourseStatus.PUBLISHED } as const;

/** Fields for a course card; shared by the domain page and the course list. */
export const courseSummarySelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  level: true,
  thumbnailUrl: true,
  modules: { select: { _count: { select: { lessons: true } } } },
} satisfies Prisma.CourseSelect;

type CourseSummaryRow = Prisma.CourseGetPayload<{ select: typeof courseSummarySelect }>;

export function toCourseSummary({ modules, ...course }: CourseSummaryRow): CourseSummary {
  return { ...course, lessonCount: modules.reduce((sum, m) => sum + m._count.lessons, 0) };
}
