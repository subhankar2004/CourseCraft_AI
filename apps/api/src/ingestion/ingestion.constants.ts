export const INGESTION_QUEUE = 'ingestion';

/** BullMQ retries for job-level outages (e.g. the AI service down): 1 min, 2 min, then give up. */
export const JOB_ATTEMPTS = 3;
export const JOB_BACKOFF_MS = 60_000;

export interface IngestionJobData {
  jobId: string;
}
