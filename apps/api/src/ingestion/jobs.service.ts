import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { videoMetadataSchema, type JobDetail } from '@coursecraft/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { IngestionEvents } from './ingestion.events.js';
import { IngestionService, JobStillRunningError } from './ingestion.service.js';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
    private readonly events: IngestionEvents,
  ) {}

  async get(id: string): Promise<JobDetail> {
    const job = await this.prisma.ingestionJob.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true, slug: true, status: true } },
        videos: { orderBy: { position: 'asc' } },
      },
    });
    if (!job) throw new NotFoundException(`Job "${id}" not found`);
    return {
      id: job.id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      error: job.error,
      report: (job.report ?? null) as JobDetail['report'],
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      course: job.course,
      videos: job.videos.map((video) => ({
        position: video.position,
        youtubeId: video.youtubeId,
        title: videoMetadataSchema.safeParse(video.metadata).data?.title ?? null,
        status: video.status,
        error: video.error,
      })),
    };
  }

  /**
   * Restarts a FAILED job from where it stopped: processed videos are kept, and failed ones go
   * back to their last completed step (transcribed if their transcript is cached, else pending).
   * Videos rejected at the metadata stage (unavailable) stay failed.
   */
  async retry(id: string): Promise<JobDetail> {
    const job = await this.prisma.ingestionJob.findUnique({
      where: { id },
      include: { videos: true },
    });
    if (!job) throw new NotFoundException(`Job "${id}" not found`);
    if (job.status !== 'FAILED') {
      throw new ConflictException(`Only failed jobs can be retried (this one is ${job.status})`);
    }
    try {
      await this.ingestion.assertNotActive(id); // before changing anything
    } catch (error) {
      if (error instanceof JobStillRunningError) throw new ConflictException(error.message);
      throw error;
    }
    const failed = job.videos.filter((v) => v.status === 'FAILED' && v.metadata !== null);
    const cached = new Set(
      (
        await this.prisma.video.findMany({
          where: { youtubeId: { in: failed.map((v) => v.youtubeId) } },
          select: { youtubeId: true },
        })
      ).map((v) => v.youtubeId),
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const video of failed) {
        await tx.ingestionJobVideo.update({
          where: { id: video.id },
          data: { status: cached.has(video.youtubeId) ? 'TRANSCRIBED' : 'PENDING', error: null },
        });
      }
      await tx.course.update({ where: { id: job.courseId }, data: { status: 'GENERATING' } });
      return tx.ingestionJob.update({
        where: { id },
        data: { status: 'QUEUED', error: null, finishedAt: null },
      });
    });
    await this.ingestion.enqueue(id, { replace: true });
    await this.events.publish(updated);
    return this.get(id);
  }
}
