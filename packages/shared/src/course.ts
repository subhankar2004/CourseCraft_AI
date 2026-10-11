import { z } from 'zod';
import { courseSummarySchema, slugSchema } from './domain.js';

export const COURSE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
export const courseLevelSchema = z.enum(COURSE_LEVELS);

/** Query string for GET /courses (values arrive as strings, hence the coercion). */
export const courseListQuerySchema = z.strictObject({
  domain: slugSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  level: courseLevelSchema.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

const domainRefSchema = z.object({ slug: z.string(), name: z.string() });

export const courseListItemSchema = courseSummarySchema.extend({ domain: domainRefSchema });

export const courseListSchema = z.object({
  items: z.array(courseListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const lessonOutlineSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int(),
  readingTimeMin: z.number().int().nullable(),
  videoDurationSec: z.number().int(),
});

export const moduleOutlineSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  order: z.number().int(),
  lessons: z.array(lessonOutlineSchema),
});

/** Course page: the full outline but no lesson bodies (they load per lesson). */
export const courseDetailSchema = courseListItemSchema.extend({
  /** Sum of the distinct source videos' lengths (several lessons may share one video). */
  totalVideoSec: z.number().int().nonnegative(),
  modules: z.array(moduleOutlineSchema),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const lessonDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int(),
  summary: z.string().nullable(),
  notesMarkdown: z.string(),
  keyConcepts: z.array(z.string()),
  readingTimeMin: z.number().int().nullable(),
  module: z.object({ id: z.string(), title: z.string(), order: z.number().int() }),
  course: z.object({ id: z.string(), slug: z.string(), title: z.string() }),
  video: z.object({
    youtubeId: z.string(),
    title: z.string(),
    channel: z.string().nullable(),
    durationSec: z.number().int(),
    thumbnailUrl: z.string().nullable(),
  }),
  /** Neighbours in course order (across module boundaries); null at the ends. */
  prevLessonId: z.string().nullable(),
  nextLessonId: z.string().nullable(),
});

export type CourseLevel = z.infer<typeof courseLevelSchema>;
export type CourseListQuery = z.infer<typeof courseListQuerySchema>;
export type CourseListItem = z.infer<typeof courseListItemSchema>;
export type CourseList = z.infer<typeof courseListSchema>;
export type LessonOutline = z.infer<typeof lessonOutlineSchema>;
export type ModuleOutline = z.infer<typeof moduleOutlineSchema>;
export type CourseDetail = z.infer<typeof courseDetailSchema>;
export type LessonDetail = z.infer<typeof lessonDetailSchema>;

// ─── Admin (#29) ────────────────────────────────────────────────────────────

export const COURSE_STATUSES = ['DRAFT', 'GENERATING', 'PUBLISHED', 'FAILED'] as const;
export const courseStatusSchema = z.enum(COURSE_STATUSES);

/** A row of `GET /admin/courses`: every course, whatever its status, with its latest job. */
export const adminCourseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  status: courseStatusSchema,
  level: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  domain: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  moduleCount: z.number().int().nonnegative(),
  lessonCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  latestJob: z
    .object({
      id: z.string(),
      status: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']),
      stage: z.string().nullable(),
      progress: z.number().int(),
      error: z.string().nullable(),
    })
    .nullable(),
});

export type CourseStatus = z.infer<typeof courseStatusSchema>;
export type AdminCourse = z.infer<typeof adminCourseSchema>;

// ─── Admin review (#31) ─────────────────────────────────────────────────────

/** `GET /admin/courses/:id`: everything the review page needs, in any status. */
export const adminCourseDetailSchema = adminCourseSchema.extend({
  description: z.string().nullable(),
  llmModel: z.string(),
  embeddingModel: z.string(),
  /** Corrections the pipeline made to the AI's outline (#25), for the reviewer. */
  outlineRepairs: z.array(z.string()),
  modules: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      summary: z.string().nullable(),
      order: z.number().int(),
      lessons: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          order: z.number().int(),
          summary: z.string().nullable(),
          readingTimeMin: z.number().int().nullable(),
          youtubeId: z.string(),
          videoDurationSec: z.number().int(),
        }),
      ),
    }),
  ),
});

/** `PATCH /courses/:id`. The slug only changes when given (public URLs stay stable). */
export const updateCourseSchema = z
  .strictObject({
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    level: courseLevelSchema.nullable().optional(),
    domainId: z.string().min(1).max(64).optional(),
    slug: slugSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/**
 * `PUT /courses/:id/outline`: the whole outline in its new order. Every existing LESSON must
 * appear exactly once (content is never lost); lessons may move between modules. A module
 * without `id` is created; an existing module left out is deleted (it is empty by then).
 */
export const courseOutlineUpdateSchema = z.strictObject({
  modules: z
    .array(
      z.strictObject({
        id: z.string().min(1).optional(),
        title: z.string().trim().min(1, 'Module title is required').max(200),
        lessonIds: z.array(z.string().min(1)).min(1, 'A module needs at least one lesson'),
      }),
    )
    .min(1),
});

export type AdminCourseDetail = z.infer<typeof adminCourseDetailSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CourseOutlineUpdate = z.infer<typeof courseOutlineUpdateSchema>;

// ─── Notes editing (#32) ────────────────────────────────────────────────────

/** `PATCH /lessons/:id` (admin). Reading time is recomputed from the notes. */
export const updateLessonSchema = z
  .strictObject({
    title: z.string().trim().min(1, 'Title is required').max(200),
    summary: z.string().trim().max(2000).nullable(),
    keyConcepts: z
      .array(z.string().trim().min(1).max(80))
      .max(20, 'At most 20 key concepts')
      .transform((items) => [...new Set(items)]),
    notesMarkdown: z.string().trim().min(1, 'Notes cannot be empty').max(100_000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
