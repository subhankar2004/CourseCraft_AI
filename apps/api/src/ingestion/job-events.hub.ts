import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ingestionEventSchema, type IngestionEvent } from '@coursecraft/shared';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';
import { ingestionChannel } from './ingestion.events.js';

type Listener = (event: IngestionEvent) => void;

/**
 * Fans job progress out to SSE clients through ONE Redis subscriber connection (a connection in
 * subscriber mode can't run other commands, so it is a duplicate of the shared client). A channel
 * is subscribed while at least one client watches that job.
 */
@Injectable()
export class JobEventsHub implements OnApplicationShutdown {
  private readonly logger = new Logger(JobEventsHub.name);
  private subscriber: Redis | undefined;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Calls `listener` for each event of the job; returns the unsubscribe function. */
  async listen(jobId: string, listener: Listener): Promise<() => void> {
    const subscriber = this.connection();
    let set = this.listeners.get(jobId);
    if (!set) {
      set = new Set();
      this.listeners.set(jobId, set);
      await subscriber.subscribe(ingestionChannel(jobId));
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(jobId);
      current?.delete(listener);
      if (current?.size === 0) {
        this.listeners.delete(jobId);
        subscriber.unsubscribe(ingestionChannel(jobId)).catch(() => undefined);
      }
    };
  }

  /** Number of jobs currently watched (for tests and diagnostics). */
  get watchedJobs(): number {
    return this.listeners.size;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.subscriber?.quit().catch(() => this.subscriber?.disconnect());
  }

  private connection(): Redis {
    if (!this.subscriber) {
      this.subscriber = this.redis.duplicate();
      this.subscriber.on('message', (channel: string, message: string) => {
        const jobId = channel.slice('ingestion:'.length);
        const parsed = ingestionEventSchema.safeParse(safeJson(message));
        if (!parsed.success) {
          this.logger.warn(`Ignoring a malformed event on ${channel}`);
          return;
        }
        for (const listener of this.listeners.get(jobId) ?? []) listener(parsed.data);
      });
    }
    return this.subscriber;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
