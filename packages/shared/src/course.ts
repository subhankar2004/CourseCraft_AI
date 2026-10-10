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
