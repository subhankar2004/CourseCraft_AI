import { z } from 'zod';

/** Mirrors the Prisma enums (apps/api/prisma/schema.prisma). */
export const JOB_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export const JOB_STAGES = [
  'METADATA',
  'TRANSCRIPT',
  'CHUNKING',
  'EMBEDDING',
  'NOTES',
  'STRUCTURING',
  'EVALUATION',
  'DONE',
] as const;
export const JOB_VIDEO_STATUSES = ['PENDING', 'TRANSCRIBED', 'PROCESSED', 'FAILED'] as const;

export const jobStatusSchema = z.enum(JOB_STATUSES);
export const jobStageSchema = z.enum(JOB_STAGES);
export const jobVideoStatusSchema = z.enum(JOB_VIDEO_STATUSES);

/**
 * Progress of a course generation job, published on Redis channel `ingestion:<jobId>` after every
 * change (#27) and streamed to the admin over SSE (#28).
 */
export const ingestionEventSchema = z.object({
  jobId: z.string(),
  courseId: z.string(),
  status: jobStatusSchema,
  stage: jobStageSchema.nullable(),
  /** 0-100 */
  progress: z.number().int().min(0).max(100),
  /** The video this event is about, when it is about one. */
  video: z
    .object({
      position: z.number().int(),
      youtubeId: z.string(),
      title: z.string().nullable(),
      status: jobVideoStatusSchema,
      error: z.string().nullable(),
    })
    .optional(),
  /** Job-level error (when the job failed). */
  error: z.string().nullable().optional(),
  at: z.iso.datetime(),
});

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobStage = z.infer<typeof jobStageSchema>;
export type JobVideoStatus = z.infer<typeof jobVideoStatusSchema>;
export type IngestionEvent = z.infer<typeof ingestionEventSchema>;
