import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IngestionEvent } from '@coursecraft/shared';
import type { Redis } from 'ioredis';
import type { IngestionJob } from '../generated/prisma/client.js';
import { REDIS } from '../redis/redis.module.js';

/** Redis pub/sub channel carrying one job's progress events (consumed by the SSE stream, #28). */
export const ingestionChannel = (jobId: string) => `ingestion:${jobId}`;

@Injectable()
export class IngestionEvents {
  private readonly logger = new Logger(IngestionEvents.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Publishes the job's current state. Never throws: progress events are best effort. */
  async publish(
    job: Pick<IngestionJob, 'id' | 'courseId' | 'status' | 'stage' | 'progress'> & {
      error?: string | null;
    },
    video?: IngestionEvent['video'],
  ): Promise<void> {
    const event: IngestionEvent = {
      jobId: job.id,
      courseId: job.courseId,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      ...(video && { video }),
      ...(job.error !== undefined && { error: job.error }),
      at: new Date().toISOString(),
    };
    try {
      await this.redis.publish(ingestionChannel(job.id), JSON.stringify(event));
    } catch (error) {
      this.logger.warn(`Could not publish progress for job ${job.id}: ${String(error)}`);
    }
  }
}
