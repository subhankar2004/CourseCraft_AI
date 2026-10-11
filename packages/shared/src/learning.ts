import { z } from 'zod';

/** Mirrors the Prisma enum ProgressStatus. */
export const PROGRESS_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;
export const progressStatusSchema = z.enum(PROGRESS_STATUSES);

/** A lesson counts as completed once this share of its video has been watched (SPEC §7.3). */
export const COMPLETION_THRESHOLD = 0.9;

export const courseProgressSummarySchema = z.object({
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  /** 0-100, rounded. */
  percent: z.number().int().min(0).max(100),
});

const lessonRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  moduleTitle: z.string(),
});

/** `POST /courses/:id/enroll` (idempotent). */
export const enrollmentSchema = z.object({
  courseId: z.string(),
  enrolledAt: z.iso.datetime(),
});

/** `PUT /lessons/:id/progress`. Without `status` it only records the position. */
export const updateProgressSchema = z.strictObject({
  status: z.enum(['IN_PROGRESS', 'COMPLETED']).optional(),
  lastPositionSec: z
    .number()
    .min(0)
    .max(24 * 3600),
});

export const lessonProgressSchema = z.object({
  lessonId: z.string(),
  status: progressStatusSchema,
  lastPositionSec: z.number(),
  completedAt: z.iso.datetime().nullable(),
  course: courseProgressSummarySchema.extend({ courseId: z.string() }),
});

/** `GET /courses/:id/next`: the first lesson, in course order, that isn't completed. */
export const nextLessonSchema = z.object({
  lesson: lessonRefSchema.nullable(),
  /** True when every lesson is completed (then `lesson` is null). */
  courseCompleted: z.boolean(),
});

/** `GET /courses/:id/progress`: the signed-in user's progress in one course. */
export const myCourseProgressSchema = z.object({
  courseId: z.string(),
  enrolled: z.boolean(),
  enrolledAt: z.iso.datetime().nullable(),
  progress: courseProgressSummarySchema,
  lessons: z.array(
    z.object({
      lessonId: z.string(),
      status: progressStatusSchema,
      lastPositionSec: z.number(),
    }),
  ),
  next: lessonRefSchema.nullable(),
});

/** `GET /me/courses`: enrolled (published) courses, most recently studied first. */
export const myCourseSchema = z.object({
  course: z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    level: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    domain: z.object({ slug: z.string(), name: z.string() }),
  }),
  enrolledAt: z.iso.datetime(),
  progress: courseProgressSummarySchema,
  /** The lesson studied most recently, to "continue where you left off". */
  lastLesson: lessonRefSchema
    .extend({
      status: progressStatusSchema,
      lastPositionSec: z.number(),
      studiedAt: z.iso.datetime(),
    })
    .nullable(),
  next: lessonRefSchema.nullable(),
});

/** `GET /me/completed-lessons?limit=`: the dashboard's "recently completed" list. */
export const completedLessonsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const completedLessonSchema = z.object({
  lessonId: z.string(),
  title: z.string(),
  moduleTitle: z.string(),
  course: z.object({ id: z.string(), slug: z.string(), title: z.string() }),
  completedAt: z.iso.datetime(),
});

export type ProgressStatus = z.infer<typeof progressStatusSchema>;
export type CourseProgressSummary = z.infer<typeof courseProgressSummarySchema>;
export type Enrollment = z.infer<typeof enrollmentSchema>;
export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;
export type LessonProgress = z.infer<typeof lessonProgressSchema>;
export type NextLesson = z.infer<typeof nextLessonSchema>;
export type MyCourseProgress = z.infer<typeof myCourseProgressSchema>;
export type MyCourse = z.infer<typeof myCourseSchema>;
export type CompletedLessonsQuery = z.infer<typeof completedLessonsQuerySchema>;
export type CompletedLesson = z.infer<typeof completedLessonSchema>;
