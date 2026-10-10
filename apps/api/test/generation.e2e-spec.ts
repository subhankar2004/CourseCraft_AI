// This file runs a queue worker: give it its own queue so parallel files never take each
// other's jobs. Hoisted above the imports, so AppModule's config sees it.
vi.hoisted(() => {
  process.env.QUEUE_PREFIX = 'cc-test-generation';
});

import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  generateCourseResponseSchema,
  jobDetailSchema,
  jobStreamEvents,
  type JobDetail,
} from '@coursecraft/shared';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { AiClient } from '../src/ai/ai-client.service.js';
import { parseSse, type SseEvent } from '../src/ai/sse.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { INGESTION_QUEUE } from '../src/ingestion/ingestion.constants.js';
import { IngestionWorkerModule } from '../src/ingestion/ingestion.module.js';
import { JobEventsHub } from '../src/ingestion/job-events.hub.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeAi } from './fake-ai.js';
import { cleanupE2eData, createE2eScope, newIp, signInAs } from './helpers.js';

const scope = createE2eScope();
const SID = scope.prefix.slice(4, 12);
const yt = (suffix: string) => `${SID}${suffix}`;

describe('Course generation API (e2e, AI client faked)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ai: FakeAi;
  let baseUrl: string;
  let admin: string;
  let student: string;
  let domainId: string;

  beforeAll(async () => {
    ai = new FakeAi(SID);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, IngestionWorkerModule],
    })
      .overrideProvider(AiClient)
      .useValue(ai)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1'); // real HTTP for the SSE stream
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    prisma = app.get(PrismaService);
    await app.get<Queue>(getQueueToken(INGESTION_QUEUE)).drain(true);

    admin = (await signInAs(app, scope, 'ADMIN')).cookie;
    student = (await signInAs(app, scope, 'STUDENT')).cookie;
    domainId = (
      await prisma.domain.create({ data: { slug: `${scope.prefix}sql`, name: 'Databases' } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma, scope);
    await prisma.video.deleteMany({ where: { youtubeId: { startsWith: SID } } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const generate = (body: object, cookie = admin, ip = newIp()) =>
    http()
      .post('/api/v1/courses/generate')
      .set('Cookie', cookie)
      .set('X-Forwarded-For', ip)
      .send(body);

  async function waitFor(jobId: string, status: 'SUCCEEDED' | 'FAILED'): Promise<JobDetail> {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const res = await http().get(`/api/v1/jobs/${jobId}`).set('Cookie', admin).expect(200);
      const job = jobDetailSchema.parse(res.body);
      if (job.status === status) return job;
      if (Date.now() > deadline) throw new Error(`job ${jobId} is ${job.status}, not ${status}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /** Reads a job's SSE stream until it ends. */
  async function stream(jobId: string, onEvent?: (event: SseEvent) => void): Promise<SseEvent[]> {
    const res = await fetch(`${baseUrl}/api/v1/jobs/${jobId}/events`, {
      headers: { cookie: admin, accept: 'text/event-stream' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const events: SseEvent[] = [];
    const chunks = res.body!.pipeThrough(new TextDecoderStream());
    for await (const event of parseSse(chunks)) {
      events.push(event);
      onEvent?.(event);
    }
    return events;
  }

  describe('POST /courses/generate', () => {
    it('requires an admin', async () => {
      await http().post('/api/v1/courses/generate').send({}).expect(401);
      await generate({ domainId, urls: [`https://youtu.be/${yt('aa1')}`] }, student).expect(403);
    });

    it('validates every URL strictly and reports each problem', async () => {
      const res = await generate({
        domainId,
        urls: [`https://youtu.be/${yt('aa1')}`, 'https://vimeo.com/1', 'http://169.254.169.254/x'],
      }).expect(400);
      expect(res.body.message).toEqual([
        expect.stringMatching(/^urls\.1: not a supported YouTube/),
        expect.stringMatching(/^urls\.2: not a supported YouTube/),
      ]);
      await generate({ domainId }).expect(400);
      await generate({ domainId: 'nope', urls: [`https://youtu.be/${yt('aa1')}`] }).expect(404);
    });

    it('creates the course and job and stores canonical URLs only', async () => {
      const res = await generate({
        domainId,
        urls: [`youtu.be/${yt('cn1')}?si=tracking`, `https://www.youtube.com/watch?v=${yt('cn1')}`],
        titleHint: 'SQL basics',
      }).expect(202);
      const { courseId, jobId } = generateCourseResponseSchema.parse(res.body);
      const job = await prisma.ingestionJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(job.courseId).toBe(courseId);
      expect(job.input).toEqual({
        source: { urls: [`https://www.youtube.com/watch?v=${yt('cn1')}`] },
        titleHint: 'SQL basics',
      });
      await waitFor(jobId, 'SUCCEEDED');
    });

    it('is rate limited per client', async () => {
      const ip = newIp();
      for (let i = 0; i < 10; i++) await generate({ domainId }, admin, ip).expect(400);
      await generate({ domainId }, admin, ip).expect(429);
    });
  });

  describe('GET /jobs/:id and the SSE stream', () => {
    it('streams progress live: snapshot, progress events, then done', async () => {
      let release!: () => void;
      ai.gate = new Promise((resolve) => (release = resolve));
      const res = await generate({
        domainId,
        urls: [yt('ss1'), yt('ss2')].map((id) => `https://youtu.be/${id}`),
      });
      const { jobId } = generateCourseResponseSchema.parse(res.body);

      const events = await stream(jobId, (event) => {
        // Let the job finish only once the client is watching a running job.
        if (event.event === 'progress' && JSON.parse(event.data).stage === 'NOTES') release();
        if (event.event === 'job' && JSON.parse(event.data).stage === 'NOTES') release();
      });
      ai.gate = undefined;

      const names = events.map((e) => e.event).filter((name) => name !== 'ping');
      expect(names[0]).toBe('job');
      expect(names.at(-1)).toBe('done');
      expect(names.filter((n) => n === 'progress').length).toBeGreaterThan(2);
      for (const event of events.filter((e) => e.event in jobStreamEvents)) {
        const schema = jobStreamEvents[event.event as keyof typeof jobStreamEvents];
        expect(schema.safeParse(JSON.parse(event.data)).success).toBe(true);
      }
      const done = jobDetailSchema.parse(JSON.parse(events.at(-1)!.data));
      expect([done.status, done.stage, done.progress, done.course.status]).toEqual([
        'SUCCEEDED',
        'DONE',
        100,
        'DRAFT',
      ]);
      expect(done.videos.map((v) => [v.youtubeId, v.status])).toEqual([
        [yt('ss1'), 'PROCESSED'],
        [yt('ss2'), 'PROCESSED'],
      ]);
      // The stream is closed and its Redis subscription released.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(app.get(JobEventsHub).watchedJobs).toBe(0);
    });

    it('ends at once for a finished job', async () => {
      const res = await generate({ domainId, urls: [`https://youtu.be/${yt('fn1')}`] });
      const { jobId } = generateCourseResponseSchema.parse(res.body);
      await waitFor(jobId, 'SUCCEEDED');
      const events = await stream(jobId);
      expect(events.map((e) => e.event)).toEqual(['job', 'done']);
    });

    it('returns 404 for unknown jobs and requires an admin', async () => {
      await http().get('/api/v1/jobs/nope').set('Cookie', admin).expect(404);
      await http().get('/api/v1/jobs/nope/events').set('Cookie', admin).expect(404);
      await http().get('/api/v1/jobs/nope').set('Cookie', student).expect(403);
    });
  });

  describe('POST /jobs/:id/retry', () => {
    it('restarts a failed job from the last completed step', async () => {
      const video = yt('rt1');
      ai.lessonFailures.add(video); // unusable notes once: every video fails, the job fails
      const res = await generate({ domainId, urls: [`https://youtu.be/${video}`] });
      const { jobId, courseId } = generateCourseResponseSchema.parse(res.body);
      const failed = await waitFor(jobId, 'FAILED');
      expect(failed.videos[0]).toMatchObject({
        status: 'FAILED',
        error: 'bad_output: notes failed',
      });
      expect(failed.course.status).toBe('FAILED');

      const retried = await http()
        .post(`/api/v1/jobs/${jobId}/retry`)
        .set('Cookie', admin)
        .expect(202);
      expect(jobDetailSchema.parse(retried.body).videos[0]?.status).toBe('TRANSCRIBED');
      const done = await waitFor(jobId, 'SUCCEEDED');
      expect(done.course).toMatchObject({ id: courseId, status: 'DRAFT' });
      expect(ai.calls.transcript.get(video)).toBe(1); // the cached transcript was reused
      expect(ai.calls.lesson.get(video)).toBe(2);
    });

    it('refuses jobs that have not failed', async () => {
      const res = await generate({ domainId, urls: [`https://youtu.be/${yt('ok1')}`] });
      const { jobId } = generateCourseResponseSchema.parse(res.body);
      await waitFor(jobId, 'SUCCEEDED');
      const conflict = await http()
        .post(`/api/v1/jobs/${jobId}/retry`)
        .set('Cookie', admin)
        .expect(409);
      expect(conflict.body.message).toMatch(/Only failed jobs/);
      await http().post('/api/v1/jobs/nope/retry').set('Cookie', admin).expect(404);
    });
  });
});
