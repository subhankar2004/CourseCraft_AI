import { z } from 'zod';
import {
  jobStageSchema,
  jobStatusSchema,
  jobVideoStatusSchema,
  ingestionEventSchema,
} from './ingestion.js';
import {
  canonicalPlaylistUrl,
  canonicalVideoUrl,
  InvalidYoutubeUrlError,
  parseYoutubeUrl,
} from './youtube.js';

/** Upper bound of URLs in one request; MAX_VIDEOS_PER_COURSE (API/AI config) applies after. */
export const MAX_GENERATE_URLS = 200;

/**
 * `POST /courses/generate` body. URLs are validated strictly and rewritten to canonical
 * youtube.com URLs, so the job never stores (or forwards) anything the user typed verbatim.
 */
export const generateCourseSchema = z
  .strictObject({
    domainId: z.string().min(1).max(64),
    urls: z.array(z.string()).min(1).max(MAX_GENERATE_URLS).optional(),
    playlistUrl: z.string().optional(),
    titleHint: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((body, ctx) => {
    if ((body.urls === undefined) === (body.playlistUrl === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'provide either urls or playlistUrl',
        path: ['urls'],
      });
      return;
    }
    body.urls?.forEach((url, index) => {
      try {
        if (parseYoutubeUrl(url).kind === 'playlist') {
          ctx.addIssue({
            code: 'custom',
            message: 'use playlistUrl for playlists',
            path: ['urls', index],
          });
        }
      } catch (error) {
        const message = error instanceof InvalidYoutubeUrlError ? error.message : 'invalid URL';
        ctx.addIssue({ code: 'custom', message, path: ['urls', index] });
      }
    });
    if (body.playlistUrl !== undefined) {
      try {
        if (parseYoutubeUrl(body.playlistUrl).kind !== 'playlist') {
          ctx.addIssue({ code: 'custom', message: 'not a playlist URL', path: ['playlistUrl'] });
        }
      } catch (error) {
        const message = error instanceof InvalidYoutubeUrlError ? error.message : 'invalid URL';
        ctx.addIssue({ code: 'custom', message, path: ['playlistUrl'] });
      }
    }
  })
  .transform(({ domainId, urls, playlistUrl, titleHint }) => ({
    domainId,
    titleHint: titleHint ?? null,
    source: urls
      ? { urls: [...new Set(urls.map((url) => canonicalVideoUrl(parseYoutubeUrl(url).id)))] }
      : { playlistUrl: canonicalPlaylistUrl(parseYoutubeUrl(playlistUrl!).id) },
  }));

export const generateCourseResponseSchema = z.object({
  courseId: z.string(),
  jobId: z.string(),
});

/** `GET /jobs/:id`: the job, its course and each video's state. */
export const jobDetailSchema = z.object({
  id: z.string(),
  status: jobStatusSchema,
  stage: jobStageSchema.nullable(),
  progress: z.number().int(),
  error: z.string().nullable(),
  report: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  course: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    status: z.enum(['DRAFT', 'GENERATING', 'PUBLISHED', 'FAILED']),
  }),
  videos: z.array(
    z.object({
      position: z.number().int(),
      youtubeId: z.string(),
      title: z.string().nullable(),
      status: jobVideoStatusSchema,
      error: z.string().nullable(),
    }),
  ),
});

/**
 * `GET /jobs/:id/events` (SSE). Event names: `job` (snapshot, first), `progress` (each change),
 * then `done` (SUCCEEDED) or `error` (FAILED) with the final job, after which the stream closes.
 * `ping` events keep idle connections open.
 */
export const jobStreamEvents = {
  job: jobDetailSchema,
  progress: ingestionEventSchema,
  done: jobDetailSchema,
  error: jobDetailSchema,
} as const;

export type GenerateCourseBody = z.input<typeof generateCourseSchema>;
export type GenerateCourseInput = z.output<typeof generateCourseSchema>;
export type GenerateCourseResponse = z.infer<typeof generateCourseResponseSchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
