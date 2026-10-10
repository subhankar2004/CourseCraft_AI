import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  generateCourseSchema,
  type GenerateCourseInput,
  type GenerateCourseResponse,
  type IngestionEvent,
  type JobDetail,
} from '@coursecraft/shared';
import { Observable } from 'rxjs';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { IngestionService } from './ingestion.service.js';
import { JobEventsHub } from './job-events.hub.js';
import { JobsService } from './jobs.service.js';

const HOUR = 60 * 60_000;
/** Keep-alive for idle streams (proxies close silent connections). */
export const PING_INTERVAL_MS = 15_000;

@Controller('courses')
@UseGuards(ThrottlerGuard)
export class GenerationController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly prisma: PrismaService,
  ) {}

  /** Starts generating a course from YouTube videos or a playlist (SPEC §7.1). */
  @Roles('ADMIN')
  @Post('generate')
  @HttpCode(202)
  @SkipThrottle({ auth: true })
  @Throttle({ generate: { limit: 10, ttl: HOUR } }) // each job runs LLMs for minutes
  async generate(
    @Body(new ZodValidationPipe(generateCourseSchema)) body: GenerateCourseInput,
    @CurrentUser() user: AuthUser,
  ): Promise<GenerateCourseResponse> {
    const domain = await this.prisma.domain.findUnique({ where: { id: body.domainId } });
    if (!domain) throw new NotFoundException(`Domain "${body.domainId}" not found`);
    return this.ingestion.startGeneration({
      domainId: domain.id,
      createdById: user.id,
      source: body.source,
      titleHint: body.titleHint,
    });
  }
}

@Controller('jobs')
@Roles('ADMIN')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly hub: JobEventsHub,
  ) {}

  @Get(':id')
  get(@Param('id') id: string): Promise<JobDetail> {
    return this.jobs.get(id);
  }

  /** Restarts a failed job from the last completed step of each video. */
  @Post(':id/retry')
  @HttpCode(202)
  retry(@Param('id') id: string): Promise<JobDetail> {
    return this.jobs.retry(id);
  }

  /**
   * Live progress (SSE): `job` (snapshot), `progress`*, then `done` or `error` and the stream
   * ends. A finished job gets its snapshot and final event at once.
   */
  @Sse(':id/events')
  async events(@Param('id') id: string): Promise<Observable<MessageEvent>> {
    await this.jobs.get(id); // 404 before the stream starts
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let unsubscribe: (() => void) | undefined;
      // Events that arrive before the snapshot is sent wait here, so the snapshot comes first.
      let pending: IngestionEvent[] | undefined = [];
      const finish = async () => {
        if (closed) return;
        closed = true;
        const final = await this.jobs.get(id);
        subscriber.next({ type: final.status === 'SUCCEEDED' ? 'done' : 'error', data: final });
        subscriber.complete();
      };
      const onEvent = (event: IngestionEvent) => {
        if (closed) return;
        if (pending) {
          pending.push(event);
          return;
        }
        subscriber.next({ type: 'progress', data: event });
        if (event.status === 'SUCCEEDED' || event.status === 'FAILED') {
          finish().catch((error: unknown) => subscriber.error(error));
        }
      };
      const ping = setInterval(() => subscriber.next({ type: 'ping', data: {} }), PING_INTERVAL_MS);

      // Subscribe BEFORE reading the snapshot, so no event can fall in between. An event that
      // arrives twice is harmless: each one carries the full current state.
      void (async () => {
        unsubscribe = await this.hub.listen(id, onEvent);
        const snapshot = await this.jobs.get(id);
        if (closed) return;
        subscriber.next({ type: 'job', data: snapshot });
        if (snapshot.status === 'SUCCEEDED' || snapshot.status === 'FAILED') {
          await finish();
          return;
        }
        // Forward what arrived meanwhile, except events older than the snapshot (progress only
        // grows within an attempt), so a client never sees progress go backwards.
        const early = pending ?? [];
        pending = undefined;
        for (const event of early) if (event.progress >= snapshot.progress) onEvent(event);
      })().catch((error: unknown) => subscriber.error(error));

      return () => {
        closed = true;
        clearInterval(ping);
        unsubscribe?.();
      };
    });
  }
}
