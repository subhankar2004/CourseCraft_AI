import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  processLessonResponseSchema,
  slugify,
  transcriptSegmentSchema,
  videoMetadataSchema,
  type IngestMetadataRequest,
  type ProcessLessonResponse,
  type VideoMetadata,
} from '@coursecraft/shared';
import { z } from 'zod';
import { AiServiceError } from '../ai/ai-client.errors.js';
import { AiClient } from '../ai/ai-client.service.js';
import { Prisma, type JobStage } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { IngestionEvents } from './ingestion.events.js';

/** What the admin asked for (stored in IngestionJob.input). */
export const generationInputSchema = z.object({
  source: z.union([
    z.object({ urls: z.array(z.string()).min(1) }),
    z.object({ playlistUrl: z.string() }),
  ]),
  titleHint: z.string().nullable().default(null),
});
export type GenerationInput = z.infer<typeof generationInputSchema>;

/** The job can't succeed whatever happens later (e.g. every video failed): don't retry it. */
export class PermanentJobError extends Error {
  override readonly name = 'PermanentJobError';
}

/** Progress (0-100) at the start and end of each stage. */
const SPAN: Record<'METADATA' | 'TRANSCRIPT' | 'NOTES' | 'STRUCTURING', [number, number]> = {
  METADATA: [0, 5],
  TRANSCRIPT: [5, 25],
  NOTES: [25, 90],
  STRUCTURING: [90, 97],
};

const segmentsSchema = z.array(transcriptSegmentSchema);

type JobWithVideos = Prisma.IngestionJobGetPayload<{
  include: { videos: true; course: { include: { domain: true } } };
}>;
type JobVideo = JobWithVideos['videos'][number];

/**
 * Runs one course generation job (SPEC §7.1) against the AI service and persists the result.
 *
 * Every stage saves its outcome per video (IngestionJobVideo), so a re-run after an outage or
 * a crash resumes where it stopped: finished videos are not fetched or processed again. Videos
 * fail individually (recorded, skipped); outages are thrown so the queue retries the whole job
 * later. The course is written in ONE transaction at the end.
 */
@Injectable()
export class IngestionPipeline {
  private readonly logger = new Logger(IngestionPipeline.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
    private readonly events: IngestionEvents,
  ) {}

  async run(jobId: string): Promise<void> {
    let job = await this.load(jobId);
    if (job.status === 'SUCCEEDED') return; // a duplicate delivery: nothing to do
    const input = generationInputSchema.parse(job.input);
    await this.prisma.ingestionJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', error: null, startedAt: job.startedAt ?? new Date() },
    });

    if (job.videos.length === 0) {
      await this.metadata(job, input);
      job = await this.load(jobId);
    }
    await this.transcripts(job);
    job = await this.load(jobId);
    await this.processLessons(job);
    job = await this.load(jobId);

    const processed = job.videos.filter((v) => v.status === 'PROCESSED');
    if (processed.length === 0) {
      const reasons = job.videos.map((v) => `${v.youtubeId}: ${v.error ?? 'failed'}`);
      throw new PermanentJobError(`every video failed (${reasons.join('; ')})`);
    }
    await this.structureAndPersist(job, processed, input);
  }

  /** An attempt failed with an outage; the queue will try again later. */
  async retrying(jobId: string, message: string): Promise<void> {
    const job = await this.prisma.ingestionJob.update({
      where: { id: jobId },
      data: { status: 'QUEUED', error: `retrying: ${message}`.slice(0, 2000) },
    });
    await this.events.publish(job);
  }

  /** Marks the job and its course as failed (no more retries). */
  async fail(jobId: string, message: string): Promise<void> {
    const job = await this.prisma.ingestionJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', error: message.slice(0, 2000), finishedAt: new Date() },
    });
    await this.prisma.course.update({ where: { id: job.courseId }, data: { status: 'FAILED' } });
    await this.events.publish({ ...job, status: 'FAILED', error: job.error });
    this.logger.warn(`Ingestion job ${jobId} failed: ${message}`);
  }

  // ─── Stages ──────────────────────────────────────────────────────────────────

  private async metadata(job: JobWithVideos, input: GenerationInput): Promise<void> {
    await this.setStage(job, 'METADATA', SPAN.METADATA[0]);
    const request: IngestMetadataRequest =
      'urls' in input.source
        ? { urls: input.source.urls }
        : { playlistUrl: input.source.playlistUrl };
    const meta = await this.ai.ingestMetadata(request, { requestId: `job-${job.id}.metadata` });

    const rows: Prisma.IngestionJobVideoCreateManyInput[] = [
      ...meta.videos.map((video) => ({
        jobId: job.id,
        youtubeId: video.youtubeId,
        lessonId: randomUUID(),
        status: 'PENDING' as const,
        metadata: video,
      })),
      ...meta.failed.map((failed) => ({
        jobId: job.id,
        youtubeId: failed.youtubeId,
        lessonId: randomUUID(),
        status: 'FAILED' as const,
        error: failed.reason,
      })),
    ].map((row, position) => ({ ...row, position }));
    if (rows.length === 0) throw new PermanentJobError('no videos found');
    await this.prisma.ingestionJobVideo.createMany({ data: rows });
    // Videos that are already known to be unusable are reported right away.
    const jobRow = await this.prisma.ingestionJob.findUniqueOrThrow({ where: { id: job.id } });
    for (const row of rows.filter((r) => r.status === 'FAILED')) {
      await this.events.publish(jobRow, {
        position: row.position,
        youtubeId: row.youtubeId,
        title: null,
        status: 'FAILED',
        error: row.error ?? null,
      });
    }
    await this.prisma.ingestionJob.update({
      where: { id: job.id },
      data: {
        report: {
          truncated: meta.truncated,
          maxVideos: meta.maxVideos,
        } satisfies Prisma.InputJsonObject,
      },
    });
    await this.setStage(job, 'METADATA', SPAN.METADATA[1]);
  }

  private async transcripts(job: JobWithVideos): Promise<void> {
    await this.setStage(job, 'TRANSCRIPT', progressAt('TRANSCRIPT', job.videos));
    for (const video of job.videos.filter((v) => v.status === 'PENDING')) {
      const meta = metadataOf(video);
      // Video rows are a cache by YouTube id: a known video's transcript is never fetched again.
      const cached = await this.prisma.video.findUnique({ where: { youtubeId: video.youtubeId } });
      if (!cached) {
        try {
          const transcript = await this.ai.ingestTranscript(
            { youtubeId: video.youtubeId, spokenLanguage: meta.language },
            { requestId: `job-${job.id}.transcript.${video.position}` },
          );
          await this.prisma.video.upsert({
            where: { youtubeId: video.youtubeId },
            create: {
              youtubeId: video.youtubeId,
              title: meta.title,
              channel: meta.channel,
              durationSec: meta.durationSec,
              thumbnailUrl: meta.thumbnailUrl,
              language: meta.language ?? transcript.language,
              transcriptSource: transcript.source,
              transcript: transcript.segments,
            },
            update: {},
          });
        } catch (error) {
          await this.videoFailedOrThrow(job, 'TRANSCRIPT', video, error);
          continue;
        }
      }
      await this.setVideo(job, 'TRANSCRIPT', video, { status: 'TRANSCRIBED' });
    }
  }

  private async processLessons(job: JobWithVideos): Promise<void> {
    await this.setStage(job, 'NOTES', progressAt('NOTES', job.videos));
    for (const video of job.videos.filter((v) => v.status === 'TRANSCRIBED')) {
      const cached = await this.prisma.video.findUniqueOrThrow({
        where: { youtubeId: video.youtubeId },
      });
      try {
        const result = await this.ai.processLesson(
          {
            courseId: job.courseId,
            lessonId: video.lessonId,
            youtubeId: video.youtubeId,
            videoTitle: cached.title,
            segments: segmentsSchema.parse(cached.transcript),
          },
          { requestId: `job-${job.id}.lesson.${video.position}` },
        );
        await this.setVideo(job, 'NOTES', video, { status: 'PROCESSED', result });
      } catch (error) {
        // A timeout here means the video is too long for this setup: skip it, don't retry the job.
        await this.videoFailedOrThrow(job, 'NOTES', video, error, { timeoutIsFinal: true });
      }
    }
  }

  private async structureAndPersist(
    job: JobWithVideos,
    processed: JobVideo[],
    input: GenerationInput,
  ): Promise<void> {
    await this.setStage(job, 'STRUCTURING', SPAN.STRUCTURING[0]);
    const results = new Map(processed.map((v) => [v.lessonId, resultOf(v)]));
    const outline = await this.ai.processStructure(
      {
        domain: job.course.domain.name,
        titleHint: input.titleHint,
        lessons: processed.map((v) => {
          const notes = resultOf(v).notes;
          return {
            ref: v.lessonId,
            title: notes.title,
            summary: notes.summary,
            keyConcepts: notes.keyConcepts.slice(0, 20),
          };
        }),
      },
      { requestId: `job-${job.id}.structure` },
    );
    await this.setStage(job, 'STRUCTURING', SPAN.STRUCTURING[1]);

    const videos = await this.prisma.video.findMany({
      where: { youtubeId: { in: processed.map((v) => v.youtubeId) } },
    });
    const videoByYoutubeId = new Map(videos.map((v) => [v.youtubeId, v]));
    const byLessonId = new Map(processed.map((v) => [v.lessonId, v]));
    const firstLesson = byLessonId.get(outline.modules[0]?.lessonRefs[0] ?? '');
    const sample = [...results.values()][0];
    const usage = [...results.values()].reduce(
      (sum, r) => ({
        llmCalls: sum.llmCalls + r.usage.llmCalls,
        inputTokens: sum.inputTokens + r.usage.inputTokens,
        outputTokens: sum.outputTokens + r.usage.outputTokens,
      }),
      { ...outline.usage },
    );
    const previousReport = (job.report ?? {}) as Prisma.JsonObject;
    const slug = await this.uniqueCourseSlug(outline.title, job.courseId);

    await this.prisma.$transaction(
      async (tx) => {
        // Idempotent: a re-run replaces anything a previous attempt wrote for this course.
        await tx.module.deleteMany({ where: { courseId: job.courseId } });
        await tx.course.update({
          where: { id: job.courseId },
          data: {
            title: outline.title,
            description: outline.description || null,
            level: outline.level,
            slug,
            status: 'DRAFT',
            thumbnailUrl: videoByYoutubeId.get(firstLesson?.youtubeId ?? '')?.thumbnailUrl ?? null,
            llmModel: sample?.chatModel ?? outline.chatModel,
            embeddingModel: sample?.embeddingModel ?? 'unknown',
          },
        });
        for (const [moduleIndex, module] of outline.modules.entries()) {
          const created = await tx.module.create({
            data: {
              courseId: job.courseId,
              title: module.title,
              summary: module.summary || null,
              order: moduleIndex,
            },
          });
          for (const [lessonIndex, lessonId] of module.lessonRefs.entries()) {
            const jobVideo = byLessonId.get(lessonId);
            const result = results.get(lessonId);
            const video = videoByYoutubeId.get(jobVideo?.youtubeId ?? '');
            if (!jobVideo || !result || !video) {
              throw new PermanentJobError(`outline refers to an unknown lesson ${lessonId}`);
            }
            await tx.lesson.create({
              data: {
                id: lessonId,
                moduleId: created.id,
                videoId: video.id,
                title: result.notes.title,
                order: lessonIndex,
                summary: result.notes.summary,
                notesMarkdown: result.notes.notesMarkdown,
                keyConcepts: result.notes.keyConcepts,
                readingTimeMin: result.notes.readingTimeMin,
              },
            });
            await tx.chunk.createMany({
              data: result.chunks.map((chunk) => ({
                id: chunk.id,
                lessonId,
                index: chunk.index,
                text: chunk.text,
                startSec: chunk.startSec,
                endSec: chunk.endSec,
                tokenCount: chunk.tokenCount,
              })),
            });
          }
        }
        // The lesson data now lives in the course; drop the staging copies.
        await tx.ingestionJobVideo.updateMany({
          where: { jobId: job.id },
          data: { result: Prisma.DbNull },
        });
        await tx.ingestionJob.update({
          where: { id: job.id },
          data: {
            status: 'SUCCEEDED',
            stage: 'DONE',
            progress: 100,
            finishedAt: new Date(),
            report: {
              ...previousReport,
              lessons: processed.length,
              failedVideos: job.videos.filter((v) => v.status === 'FAILED').length,
              modules: outline.modules.length,
              outlineRepairs: outline.repairs,
              outlineFallback: outline.fallback,
              promptIds: [...new Set([...(sample?.notes.promptIds ?? []), outline.promptId])],
              usage,
            },
          },
        });
      },
      { timeout: 60_000 },
    );
    await this.events.publish({ ...job, status: 'SUCCEEDED', stage: 'DONE', progress: 100 });
    this.logger.log(
      `Ingestion job ${job.id}: course ${job.courseId} ready (${processed.length} lessons, ${outline.modules.length} modules)`,
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private load(jobId: string): Promise<JobWithVideos> {
    return this.prisma.ingestionJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { videos: { orderBy: { position: 'asc' } }, course: { include: { domain: true } } },
    });
  }

  private async setStage(job: JobWithVideos, stage: JobStage, progress: number): Promise<void> {
    const updated = await this.prisma.ingestionJob.update({
      where: { id: job.id },
      data: { stage, progress: Math.round(progress) },
    });
    await this.events.publish(updated);
  }

  private async setVideo(
    job: JobWithVideos,
    stage: 'TRANSCRIPT' | 'NOTES',
    video: JobVideo,
    change: {
      status: 'TRANSCRIBED' | 'PROCESSED' | 'FAILED';
      error?: string;
      result?: ProcessLessonResponse;
    },
  ): Promise<void> {
    const updated = await this.prisma.ingestionJobVideo.update({
      where: { id: video.id },
      data: {
        status: change.status,
        error: change.error ?? null,
        ...(change.result && { result: change.result as Prisma.InputJsonObject }),
      },
    });
    const videos = await this.prisma.ingestionJobVideo.findMany({
      where: { jobId: job.id },
      select: { status: true },
    });
    const jobRow = await this.prisma.ingestionJob.update({
      where: { id: job.id },
      data: { progress: Math.round(progressAt(stage, videos)) },
    });
    await this.events.publish(jobRow, {
      position: updated.position,
      youtubeId: updated.youtubeId,
      title: updated.metadata ? metadataOf(updated).title : null,
      status: updated.status,
      error: updated.error,
    });
  }

  /** Records a video-level failure, or rethrows an outage so the whole job is retried later. */
  private async videoFailedOrThrow(
    job: JobWithVideos,
    stage: 'TRANSCRIPT' | 'NOTES',
    video: JobVideo,
    error: unknown,
    options: { timeoutIsFinal?: boolean } = {},
  ): Promise<void> {
    if (!(error instanceof AiServiceError)) throw error;
    const final = !error.retryable || (options.timeoutIsFinal === true && error.kind === 'timeout');
    if (!final) throw error;
    this.logger.warn(
      `Job ${job.id}: video ${video.youtubeId} skipped (${error.kind}): ${error.message}`,
    );
    await this.setVideo(job, stage, video, {
      status: 'FAILED',
      error: `${error.kind}: ${error.message}`,
    });
  }

  private async uniqueCourseSlug(title: string, courseId: string): Promise<string> {
    const base = slugify(title) || 'course';
    const taken = new Set(
      (
        await this.prisma.course.findMany({
          where: { slug: { startsWith: base }, NOT: { id: courseId } },
          select: { slug: true },
        })
      ).map((c) => c.slug),
    );
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }
}

/**
 * Progress inside a stage: its start, plus its share for the videos no longer waiting for it
 * (done or failed). Transcripts wait in PENDING, processing waits in TRANSCRIBED.
 */
function progressAt(stage: 'TRANSCRIPT' | 'NOTES', videos: readonly { status: string }[]): number {
  const [start, end] = SPAN[stage];
  if (videos.length === 0) return start;
  const waiting = stage === 'TRANSCRIPT' ? ['PENDING'] : ['PENDING', 'TRANSCRIBED'];
  const left = videos.filter((v) => waiting.includes(v.status)).length;
  return start + ((end - start) * (videos.length - left)) / videos.length;
}

function metadataOf(video: { metadata: Prisma.JsonValue | null }): VideoMetadata {
  return videoMetadataSchema.parse(video.metadata);
}

function resultOf(video: JobVideo): ProcessLessonResponse {
  return processLessonResponseSchema.parse(video.result);
}
