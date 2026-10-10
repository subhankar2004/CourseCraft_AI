import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';
import { AiServiceError } from '../ai/ai-client.errors.js';
import { INGESTION_QUEUE, type IngestionJobData } from './ingestion.constants.js';
import { IngestionPipeline, PermanentJobError } from './ingestion.pipeline.js';

/**
 * BullMQ worker for course generation. One job at a time: a local LLM serves one request well,
 * and lessons are processed one by one inside a job anyway.
 */
@Processor(INGESTION_QUEUE, { concurrency: 1 })
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(private readonly pipeline: IngestionPipeline) {
    super();
  }

  async process(job: Job<IngestionJobData>): Promise<void> {
    const { jobId } = job.data;
    try {
      await this.pipeline.run(jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent =
        error instanceof PermanentJobError || (error instanceof AiServiceError && !error.retryable);
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (permanent || lastAttempt) {
        await this.pipeline.fail(jobId, message);
        throw new UnrecoverableError(message); // no further BullMQ retries
      }
      await this.pipeline.retrying(jobId, message);
      this.logger.warn(
        `Ingestion job ${jobId} attempt ${job.attemptsMade + 1} failed; will retry: ${message}`,
      );
      throw error; // BullMQ retries with backoff; the pipeline resumes from saved state
    }
  }
}
