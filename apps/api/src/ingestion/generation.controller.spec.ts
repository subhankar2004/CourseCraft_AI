import type { MessageEvent } from '@nestjs/common';
import type { IngestionEvent, JobDetail } from '@coursecraft/shared';
import { firstValueFrom, toArray } from 'rxjs';
import { JobsController } from './generation.controller.js';
import type { JobEventsHub } from './job-events.hub.js';
import type { JobsService } from './jobs.service.js';

const detail = (over: Partial<JobDetail>): JobDetail => ({
  id: 'j1',
  status: 'RUNNING',
  stage: 'NOTES',
  progress: 50,
  error: null,
  report: null,
  createdAt: '2026-10-11T10:00:00.000Z',
  startedAt: '2026-10-11T10:00:00.000Z',
  finishedAt: null,
  course: { id: 'c1', title: 'T', slug: 't', status: 'GENERATING' },
  videos: [],
  ...over,
});

const event = (over: Partial<IngestionEvent>): IngestionEvent => ({
  jobId: 'j1',
  courseId: 'c1',
  status: 'RUNNING',
  stage: 'NOTES',
  progress: 50,
  at: '2026-10-11T10:00:00.000Z',
  ...over,
});

/**
 * The race the stream must survive: events published between subscribing to Redis and reading
 * the snapshot. Here they are fired deterministically inside that window.
 */
describe('JobsController.events (SSE ordering)', () => {
  it('sends the snapshot first, drops events older than it, then follows live', async () => {
    let listener!: (e: IngestionEvent) => void;
    let snapshotCalls = 0;
    const jobs = {
      get: () => {
        snapshotCalls++;
        if (snapshotCalls === 2) {
          // While the snapshot is being read, two events arrive: one older, one newer.
          listener(event({ progress: 40 }));
          listener(event({ progress: 70 }));
        }
        if (snapshotCalls >= 3)
          return Promise.resolve(detail({ status: 'SUCCEEDED', stage: 'DONE', progress: 100 }));
        return Promise.resolve(detail({ progress: 60 }));
      },
    } as unknown as JobsService;
    const hub = {
      listen: (_id: string, l: (e: IngestionEvent) => void) => {
        listener = l;
        return Promise.resolve(() => undefined);
      },
    } as unknown as JobEventsHub;

    const stream = await new JobsController(jobs, hub).events('j1');
    const collected = firstValueFrom(stream.pipe(toArray()));
    await new Promise((resolve) => setTimeout(resolve, 10));
    listener(event({ status: 'SUCCEEDED', stage: 'DONE', progress: 100 }));
    const out: MessageEvent[] = await collected;

    expect(out.map((m) => [m.type, (m.data as { progress: number }).progress])).toEqual([
      ['job', 60],
      ['progress', 70], // the older event (40) was dropped
      ['progress', 100],
      ['done', 100],
    ]);
  });

  it('ends at once when the job is already finished', async () => {
    const jobs = {
      get: () => Promise.resolve(detail({ status: 'FAILED', error: 'boom' })),
    } as unknown as JobsService;
    const hub = { listen: () => Promise.resolve(() => undefined) } as unknown as JobEventsHub;
    const out = await firstValueFrom(
      (await new JobsController(jobs, hub).events('j1')).pipe(toArray()),
    );
    expect(out.map((m) => m.type)).toEqual(['job', 'error']);
  });
});
