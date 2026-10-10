// This file runs a queue worker: give it its own queue so parallel files never take each
// other's jobs. Hoisted above the imports, so AppModule's config sees it.
vi.hoisted(() => {
  process.env.QUEUE_PREFIX = 'cc-test-ingestion';
});

import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ingestionEventSchema, type IngestionEvent } from '@coursecraft/shared';
import type { Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { AiClient } from '../src/ai/ai-client.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { INGESTION_QUEUE, type IngestionJobData } from '../src/ingestion/ingestion.constants.js';
import { ingestionChannel } from '../src/ingestion/ingestion.events.js';
import { IngestionWorkerModule } from '../src/ingestion/ingestion.module.js';
import { IngestionPipeline } from '../src/ingestion/ingestion.pipeline.js';
import { IngestionProcessor } from '../src/ingestion/ingestion.processor.js';
import { IngestionService } from '../src/ingestion/ingestion.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { fail, FakeAi } from './fake-ai.js';
import { cleanupE2eData, createE2eScope, uniqueId } from './helpers.js';

const scope = createE2eScope();
const SID = scope.prefix.slice(4, 12); // the scope's 8-character id
/** 11-character YouTube ids unique to this run. */
const yt = (suffix: string) => `${SID}${suffix}`;

describe('Ingestion pipeline (e2e, AI client faked; real PostgreSQL, Redis and BullMQ)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ingestion: IngestionService;
  let ai: FakeAi;
  let subscriber: Redis;
  let domainId: string;
  let adminId: string;
  const events = new Map<string, IngestionEvent[]>();

  beforeAll(async () => {
    ai = new FakeAi(SID);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, IngestionWorkerModule], // the worker is off by default in tests
    })
      .overrideProvider(AiClient)
      .useValue(ai)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    ingestion = app.get(IngestionService);

    const queue = app.get<Queue>(getQueueToken(INGESTION_QUEUE));
    await queue.drain(true); // leftovers of an interrupted earlier run

    subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    await subscriber.psubscribe('ingestion:*');
    subscriber.on('pmessage', (_pattern, channel, message) => {
      const event = ingestionEventSchema.parse(JSON.parse(message));
      const jobId = channel.slice('ingestion:'.length);
      events.set(jobId, [...(events.get(jobId) ?? []), event]);
    });

    const admin = await prisma.user.create({
      data: {
        email: `admin-${uniqueId()}${scope.emailDomain}`,
        name: 'E2E admin',
        role: 'ADMIN',
        passwordHash: 'unused',
      },
    });
    adminId = admin.id;
    const domain = await prisma.domain.create({
      data: { slug: `${scope.prefix}databases`, name: 'Databases' },
    });
    domainId = domain.id;
  });

  afterAll(async () => {
    await subscriber.quit();
    await cleanupE2eData(prisma, scope);
    await prisma.video.deleteMany({ where: { youtubeId: { startsWith: SID } } });
    await app.close();
  });

  async function waitForJob(jobId: string, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const job = await prisma.ingestionJob.findUniqueOrThrow({ where: { id: jobId } });
      if (job.status === 'SUCCEEDED' || job.status === 'FAILED') return job;
      if (Date.now() > deadline) throw new Error(`job ${jobId} still ${job.status}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /** Events arrive asynchronously, after the database commit they describe. */
  async function lastEvent(
    jobId: string,
    status: 'SUCCEEDED' | 'FAILED',
  ): Promise<IngestionEvent[]> {
    const deadline = Date.now() + 5_000;
    while (events.get(jobId)?.at(-1)?.status !== status) {
      if (Date.now() > deadline) throw new Error(`no ${status} event for job ${jobId}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return events.get(jobId) ?? [];
  }

  function start(ids: string[], titleHint: string | null = null) {
    return ingestion.startGeneration({
      domainId,
      createdById: adminId,
      source: { urls: ids.map((id) => `https://youtu.be/${id}`) },
      titleHint,
    });
  }

  it('turns videos into a full course in one transaction, skipping the ones that fail', async () => {
    const [a, b, c] = [yt('aa1'), yt('nc1'), yt('cc1')];
    const { courseId, jobId } = await start([a, b, c, 'Zzzzzzzzzzz']);
    const job = await waitForJob(jobId);
    expect([job.status, job.stage, job.progress, job.error]).toEqual([
      'SUCCEEDED',
      'DONE',
      100,
      null,
    ]);

    const course = await prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: { orderBy: { order: 'asc' }, include: { chunks: true, video: true } },
          },
        },
      },
    });
    expect(course).toMatchObject({
      status: 'DRAFT',
      title: `E2E ${SID} Databases Course`,
      slug: `e2e-${SID}-databases-course`,
      level: 'Beginner',
      llmModel: 'fake-llm',
      embeddingModel: 'fake-embed',
      thumbnailUrl: `https://i.ytimg.com/vi/${a}/hqdefault.jpg`,
    });
    // b (no captions) and the unknown video were skipped; a and c became lessons.
    const lessons = course.modules.flatMap((m) => m.lessons);
    expect(course.modules.map((m) => [m.title, m.order])).toEqual([
      ['Foundations', 0],
      ['Going further', 1],
    ]);
    expect(lessons.map((l) => l.video.youtubeId)).toEqual([a, c]);
    const jobVideos = await prisma.ingestionJobVideo.findMany({
      where: { jobId },
      orderBy: { position: 'asc' },
    });
    expect(jobVideos.map((v) => [v.youtubeId, v.status])).toEqual([
      [a, 'PROCESSED'],
      [b, 'FAILED'],
      [c, 'PROCESSED'],
      ['Zzzzzzzzzzz', 'FAILED'],
    ]);
    expect(jobVideos[1]?.error).toBe('rejected: no captions');
    expect(jobVideos.every((v) => v.result === null)).toBe(true); // staging copies dropped
    // Lesson ids were allocated up front and match the chunk ids the AI service used.
    for (const lesson of lessons) {
      const allocated = jobVideos.find((v) => v.youtubeId === lesson.video.youtubeId);
      expect(lesson.id).toBe(allocated?.lessonId);
      expect(lesson.chunks.map((ch) => ch.id).sort()).toEqual([`${lesson.id}-0`, `${lesson.id}-1`]);
      expect(lesson.notesMarkdown).toContain('[▶ 0:05]');
    }
    expect(job.report).toMatchObject({
      lessons: 2,
      failedVideos: 2,
      modules: 2,
      outlineFallback: false,
      usage: { llmCalls: 5, inputTokens: 240, outputTokens: 120 },
    });

    // Progress events: every stage, never going backwards, per-video updates, ending DONE.
    const seen = await lastEvent(jobId, 'SUCCEEDED');
    expect(seen.at(-1)).toMatchObject({ status: 'SUCCEEDED', stage: 'DONE', progress: 100 });
    const progress = seen.map((e) => e.progress);
    expect(progress).toEqual([...progress].sort((x, y) => x - y));
    expect(new Set(seen.map((e) => e.stage))).toEqual(
      new Set(['METADATA', 'TRANSCRIPT', 'NOTES', 'STRUCTURING', 'DONE']),
    );
    expect(seen.filter((e) => e.video?.youtubeId === b).map((e) => e.video?.status)).toEqual([
      'FAILED',
    ]);
    // Videos rejected at the metadata stage are reported too.
    expect(seen.find((e) => e.video?.youtubeId === 'Zzzzzzzzzzz')?.video).toMatchObject({
      status: 'FAILED',
      error: 'Video unavailable',
    });
  });

  it('reuses cached videos instead of fetching their transcripts again', async () => {
    const shared = yt('sh1');
    const first = await start([shared, yt('sh2')]);
    await waitForJob(first.jobId);
    const second = await start([shared]);
    const job = await waitForJob(second.jobId);
    expect(job.status).toBe('SUCCEEDED');
    expect(ai.calls.transcript.get(shared)).toBe(1); // fetched once, used by two courses
    expect(ai.calls.lesson.get(shared)).toBe(2); // each course gets its own lesson
    const lessons = await prisma.lesson.findMany({ where: { video: { youtubeId: shared } } });
    expect(new Set(lessons.map((l) => l.id)).size).toBe(2);
  });

  it('resumes after an outage without redoing finished videos', async () => {
    const pipeline = app.get(IngestionPipeline);
    const [first, second] = [yt('rs1'), yt('rs2')];
    ai.lessonOutages.add(second);
    // Created without the queue so this test drives the attempts itself.
    const { jobId, courseId } = await prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          slug: `${scope.prefix}resume`,
          title: 'Resume',
          status: 'GENERATING',
          domainId,
          createdById: adminId,
          llmModel: 'pending',
          embeddingModel: 'pending',
        },
      });
      const created = await tx.ingestionJob.create({
        data: {
          courseId: course.id,
          input: {
            source: { urls: [first, second].map((id) => `https://youtu.be/${id}`) },
            titleHint: null,
          },
        },
      });
      return { jobId: created.id, courseId: course.id };
    });

    await expect(pipeline.run(jobId)).rejects.toMatchObject({ kind: 'unavailable' });
    const midway = await prisma.ingestionJobVideo.findMany({
      where: { jobId },
      orderBy: { position: 'asc' },
    });
    expect(midway.map((v) => v.status)).toEqual(['PROCESSED', 'TRANSCRIBED']);

    await pipeline.run(jobId);
    expect(ai.calls.transcript.get(first)).toBe(1);
    expect(ai.calls.lesson.get(first)).toBe(1); // not processed again
    expect(ai.calls.lesson.get(second)).toBe(2);
    const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    expect(course.status).toBe('DRAFT');
  });

  it('fails the job and the course when every video fails', async () => {
    const { jobId, courseId } = await start([yt('nc2'), yt('bn1')]);
    const job = await waitForJob(jobId);
    expect(job.status).toBe('FAILED');
    expect(job.error).toMatch(/^every video failed/);
    expect(job.error).toContain('bad_output: notes failed');
    expect((await prisma.course.findUniqueOrThrow({ where: { id: courseId } })).status).toBe(
      'FAILED',
    );
    expect((await lastEvent(jobId, 'FAILED')).at(-1)?.error).toMatch(/^every video failed/);
  });

  it('writes nothing when the final transaction fails', async () => {
    ai.brokenOutline = true;
    try {
      const { jobId, courseId } = await start([yt('tx1'), yt('tx2')]);
      const job = await waitForJob(jobId);
      expect(job.status).toBe('FAILED');
      expect(job.error).toMatch(/unknown lesson/);
      expect(await prisma.module.count({ where: { courseId } })).toBe(0);
      expect(await prisma.lesson.count({ where: { video: { youtubeId: yt('tx1') } } })).toBe(0);
    } finally {
      ai.brokenOutline = false;
    }
  });

  describe('processor retry policy', () => {
    const fakeJob = (jobId: string, attemptsMade: number) =>
      ({
        data: { jobId },
        attemptsMade,
        opts: { attempts: 3 },
      }) as unknown as Job<IngestionJobData>;

    it('re-queues an outage until the last attempt, then fails the job', async () => {
      const processor = app.get(IngestionProcessor);
      const pipeline = app.get(IngestionPipeline);
      const { jobId } = await prisma.$transaction(async (tx) => {
        const course = await tx.course.create({
          data: {
            slug: `${scope.prefix}retry`,
            title: 'Retry',
            status: 'GENERATING',
            domainId,
            createdById: adminId,
            llmModel: 'pending',
            embeddingModel: 'pending',
          },
        });
        const created = await tx.ingestionJob.create({
          data: { courseId: course.id, input: { source: { urls: ['x'] }, titleHint: null } },
        });
        return { jobId: created.id };
      });
      const run = vi.spyOn(pipeline, 'run').mockRejectedValue(fail('unavailable', 'AI down'));
      try {
        await expect(processor.process(fakeJob(jobId, 0))).rejects.toMatchObject({
          kind: 'unavailable',
        });
        let job = await prisma.ingestionJob.findUniqueOrThrow({ where: { id: jobId } });
        expect([job.status, job.error]).toEqual(['QUEUED', 'retrying: AI down']);

        await expect(processor.process(fakeJob(jobId, 2))).rejects.toThrow('AI down');
        job = await prisma.ingestionJob.findUniqueOrThrow({ where: { id: jobId } });
        expect(job.status).toBe('FAILED');
      } finally {
        run.mockRestore();
      }
    });
  });

  it('publishes on the job channel', () => {
    expect(ingestionChannel('abc')).toBe('ingestion:abc');
  });
});
