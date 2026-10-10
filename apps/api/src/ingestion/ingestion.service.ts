import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  INGESTION_QUEUE,
  JOB_ATTEMPTS,
  JOB_BACKOFF_MS,
  type IngestionJobData,
} from './ingestion.constants.js';
import type { GenerationInput } from './ingestion.pipeline.js';

export interface StartGeneration extends GenerationInput {
  domainId: string;
  createdById: string;
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue<IngestionJobData>,
  ) {}

  /**
   * Creates the course (GENERATING, placeholder title and slug until the outline exists) and its
   * job, then enqueues the job. The HTTP endpoint arrives in #28.
   */
  async startGeneration(input: StartGeneration): Promise<{ courseId: string; jobId: string }> {
    const { courseId, jobId } = await this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          slug: `generating-${randomUUID()}`,
          title: input.titleHint ?? 'Generating course…',
          status: 'GENERATING',
          domainId: input.domainId,
          createdById: input.createdById,
          llmModel: 'pending',
          embeddingModel: 'pending',
        },
      });
      const job = await tx.ingestionJob.create({
        data: {
          courseId: course.id,
          input: { source: input.source, titleHint: input.titleHint },
        },
      });
      return { courseId: course.id, jobId: job.id };
    });
    await this.enqueue(jobId);
    return { courseId, jobId };
  }

  /** (Re-)queues a job. The BullMQ job id equals the job id, so it is never queued twice. */
  async enqueue(jobId: string): Promise<void> {
    await this.queue.add(
      'generate',
      { jobId },
      {
        jobId,
        attempts: JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: JOB_BACKOFF_MS },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    );
  }
}
