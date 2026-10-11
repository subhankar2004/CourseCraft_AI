import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  chatSessionSchema,
  chatSessionSummarySchema,
  chatStreamEvents,
  type RagAnswerRequest,
  type RagCitation,
  parseSse,
  type SseEvent,
} from '@coursecraft/shared';
import request from 'supertest';
import { AiServiceError } from '../src/ai/ai-client.errors.js';
import { AiClient } from '../src/ai/ai-client.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { CHAT_LIMITS, ChatRateLimiter } from '../src/chat/chat-rate-limiter.js';
import { FAILED_MESSAGE } from '../src/chat/chat.service.js';
import type { CourseStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupE2eData, createE2eScope, signInAs } from './helpers.js';

const scope = createE2eScope();
const SID = scope.prefix.slice(4, 12);

const event = (name: string, data: unknown): SseEvent => ({
  event: name,
  data: JSON.stringify(data),
});

function done(answer: string, citations: RagCitation[], grounded = true): SseEvent {
  return event('done', {
    grounded,
    answer,
    citations,
    sources: citations,
    standaloneQuestion: null,
    bestScore: grounded ? 0.8 : 0.4,
    refusal: grounded ? null : 'low_score',
    minScore: 0.6,
    promptIds: ['rag-answer@3', 'rag-question@2'],
    chatModel: 'llama3.1:8b',
    embeddingModel: 'nomic-embed-text',
    usage: { llmCalls: grounded ? 1 : 0, inputTokens: 10, outputTokens: 5 },
  });
}

const citation = (n: number, lessonId: string, startSec: number): RagCitation => ({
  n,
  chunkId: `${lessonId}-0`,
  chunkIds: [`${lessonId}-0`, `${lessonId}-1`],
  lessonId,
  lessonTitle: 'Title when indexed',
  youtubeId: 'yt',
  startSec,
  endSec: startSec + 90,
  seekSec: startSec + 30,
  score: 0.81,
});

type Step = SseEvent | Error | Promise<void>;

/** The AI service's answer stream, scripted per test. Records every request. */
class FakeChatAi {
  requests: RagAnswerRequest[] = [];
  signals: AbortSignal[] = [];
  script: (body: RagAnswerRequest) => Step[] = () => [];

  async *ragAnswer(
    body: RagAnswerRequest,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<SseEvent> {
    this.requests.push(body);
    if (options?.signal) this.signals.push(options.signal);
    for (const step of this.script(body)) {
      if (step instanceof Promise) {
        // Waits like a slow model, but gives up (as the real client does) when aborted.
        await new Promise<void>((resolve, reject) => {
          void step.then(resolve);
          options?.signal?.addEventListener('abort', () =>
            reject(new AiServiceError('aborted', 'aborted', '/rag/answer', 'fake')),
          );
        });
        continue;
      }
      if (step instanceof Error) throw step;
      yield step;
    }
  }
}

describe('Course chat API (e2e, AI stream faked)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ai: FakeChatAi;
  let baseUrl: string;
  let adminId: string;
  let domainId: string;
  let n = 0;

  beforeAll(async () => {
    ai = new FakeChatAi();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiClient)
      .useValue(ai)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1'); // real HTTP: the answer is a stream
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    prisma = app.get(PrismaService);
    adminId = (await signInAs(app, scope, 'ADMIN')).user.id;
    domainId = (
      await prisma.domain.create({ data: { slug: `${scope.prefix}d`, name: `D ${SID}` } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma, scope);
    await prisma.video.deleteMany({ where: { youtubeId: { startsWith: SID } } });
    await app.close();
  });

  beforeEach(() => {
    ai.requests = [];
    ai.signals = [];
  });

  /** A course with two lessons; returns its id and the lesson ids. */
  async function makeCourse(status: CourseStatus = 'PUBLISHED') {
    n++;
    const course = await prisma.course.create({
      data: {
        slug: `${scope.prefix}c${n}`,
        title: `Course ${n}`,
        status,
        domainId,
        createdById: adminId,
        llmModel: 'm',
        embeddingModel: 'e',
      },
    });
    const module = await prisma.module.create({
      data: { courseId: course.id, title: 'M1', order: 0 },
    });
    const lessons: string[] = [];
    for (const [order, title] of ['Joins', 'Indexes'].entries()) {
      const video = await prisma.video.create({
        data: {
          youtubeId: `${SID}${n}${order}`.padEnd(11, 'x').slice(0, 11),
          title,
          durationSec: 600,
          transcriptSource: 'YT_MANUAL',
          transcript: [],
        },
      });
      const lesson = await prisma.lesson.create({
        data: {
          moduleId: module.id,
          videoId: video.id,
          title,
          order,
          notesMarkdown: 'n',
          keyConcepts: [],
        },
      });
      lessons.push(lesson.id);
    }
    return { courseId: course.id, joins: lessons[0]!, indexes: lessons[1]! };
  }

  /** A signed-in student, enrolled in `courseId` unless told otherwise. */
  async function student(courseId?: string) {
    const { cookie, user } = await signInAs(app, scope, 'STUDENT');
    if (courseId) {
      await prisma.enrollment.create({ data: { userId: user.id, courseId } });
    }
    return { cookie, userId: user.id };
  }

  /** POSTs a question and reads the whole SSE answer. */
  async function ask(
    cookie: string,
    courseId: string,
    body: object,
    signal?: AbortSignal,
  ): Promise<{ status: number; events: { event: string; data: unknown }[]; headers: Headers }> {
    const res = await fetch(`${baseUrl}/api/v1/courses/${courseId}/chat`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.headers.get('content-type')?.startsWith('text/event-stream')) {
      return { status: res.status, events: [], headers: res.headers };
    }
    const events: { event: string; data: unknown }[] = [];
    for await (const e of parseSse(res.body!.pipeThrough(new TextDecoderStream()))) {
      const schema = chatStreamEvents[e.event as keyof typeof chatStreamEvents];
      expect(schema, `unknown event ${e.event}`).toBeDefined();
      events.push({ event: e.event, data: schema.parse(JSON.parse(e.data)) });
    }
    return { status: res.status, events, headers: res.headers };
  }

  const names = (events: { event: string }[]) =>
    events.map((e) => e.event).filter((e) => e !== 'ping');

  it('streams an answer, saves both messages and resolves citations to current lessons', async () => {
    const { courseId, joins, indexes } = await makeCourse();
    const other = await makeCourse();
    const { cookie } = await student(courseId);
    ai.script = () => [
      event('token', { text: 'A join ' }),
      event('token', { text: 'combines rows [1]. Indexes [2]. Elsewhere [3].' }),
      done('A join combines rows [1]. Indexes [2]. Elsewhere [3].', [
        citation(1, joins, 30),
        citation(2, indexes, 120),
        citation(3, other.joins, 0), // another course's lesson: never shown
      ]),
    ];

    const { status, events } = await ask(cookie, courseId, { message: '  How does a join work? ' });
    expect(status).toBe(200);
    expect(names(events)).toEqual(['session', 'token', 'token', 'done']);
    const session = chatStreamEvents.session.parse(events[0]!.data);
    const final = chatStreamEvents.done.parse(events.at(-1)!.data);
    expect(final.sessionId).toBe(session.sessionId);
    expect(final.refusal).toBeNull();
    expect(final.message).toMatchObject({
      role: 'ASSISTANT',
      content: 'A join combines rows [1]. Indexes [2]. Elsewhere [3].',
      grounded: true,
      citations: [
        { n: 1, lessonId: joins, lessonTitle: 'Joins', startSec: 30, endSec: 120, seekSec: 60 },
        {
          n: 2,
          lessonId: indexes,
          lessonTitle: 'Indexes',
          startSec: 120,
          endSec: 210,
          seekSec: 150,
        },
      ],
    });

    expect(ai.requests).toEqual([{ courseId, question: 'How does a join work?', history: [] }]);
    const saved = await prisma.chatMessage.findMany({
      where: { sessionId: session.sessionId },
      orderBy: { createdAt: 'asc' },
    });
    expect(saved.map((m) => [m.role, m.content, m.grounded])).toEqual([
      ['USER', 'How does a join work?', null],
      ['ASSISTANT', 'A join combines rows [1]. Indexes [2]. Elsewhere [3].', true],
    ]);
    expect(saved[1]!.citations).toEqual([
      expect.objectContaining({ n: 1, lessonId: joins, chunkIds: [`${joins}-0`, `${joins}-1`] }),
      expect.objectContaining({ n: 2, lessonId: indexes }),
      expect.objectContaining({ n: 3, lessonId: other.joins }),
    ]);
  });

  it('continues a conversation with its history and lists it', async () => {
    const { courseId, joins } = await makeCourse();
    const { cookie } = await student(courseId);
    ai.script = (body) => [
      event('token', { text: `answer to ${body.question}` }),
      done(`answer to ${body.question} [1]`, [citation(1, joins, 0)]),
    ];
    const first = await ask(cookie, courseId, { message: 'What is a join?' });
    const { sessionId } = chatStreamEvents.session.parse(first.events[0]!.data);
    await ask(cookie, courseId, { sessionId, message: 'Explain that again with an example' });

    expect(ai.requests[1]).toEqual({
      courseId,
      question: 'Explain that again with an example',
      history: [
        { role: 'user', content: 'What is a join?' },
        { role: 'assistant', content: 'answer to What is a join? [1]' },
      ],
    });

    // A renamed lesson shows its new title in the history.
    await prisma.lesson.update({ where: { id: joins }, data: { title: 'SQL joins' } });
    const list = chatSessionSummarySchema
      .array()
      .parse(
        (
          await request(app.getHttpServer())
            .get(`/api/v1/courses/${courseId}/chat/sessions`)
            .set('Cookie', cookie)
            .expect(200)
        ).body,
      );
    expect(list).toEqual([
      expect.objectContaining({ id: sessionId, title: 'What is a join?', messageCount: 4 }),
    ]);
    const conversation = chatSessionSchema.parse(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/courses/${courseId}/chat/sessions/${sessionId}`)
          .set('Cookie', cookie)
          .expect(200)
      ).body,
    );
    expect(conversation.messages.map((m) => [m.role, m.content])).toEqual([
      ['USER', 'What is a join?'],
      ['ASSISTANT', 'answer to What is a join? [1]'],
      ['USER', 'Explain that again with an example'],
      ['ASSISTANT', 'answer to Explain that again with an example [1]'],
    ]);
    expect(conversation.messages[1]!.citations[0]?.lessonTitle).toBe('SQL joins');
  });

  it('keeps a refusal as an ungrounded answer', async () => {
    const { courseId } = await makeCourse();
    const { cookie } = await student(courseId);
    ai.script = () => [
      event('token', { text: "This isn't covered" }),
      done("This isn't covered in this course's lessons.", [], false),
    ];
    const { events } = await ask(cookie, courseId, { message: 'Capital of Australia?' });
    const final = chatStreamEvents.done.parse(events.at(-1)!.data);
    expect(final.refusal).toBe('low_score');
    expect(final.message).toMatchObject({ grounded: false, citations: [] });
  });

  it('ends with `failed` when the AI service fails, keeping the question', async () => {
    const { courseId } = await makeCourse();
    const { cookie } = await student(courseId);

    ai.script = () => [new AiServiceError('unavailable', 'connection refused', '/rag/answer', 'r')];
    const before = await ask(cookie, courseId, { message: 'What is a join?' });
    expect(names(before.events)).toEqual(['session', 'failed']);
    expect(before.events[1]!.data).toEqual({ message: FAILED_MESSAGE });

    ai.script = () => [event('token', { text: 'A join' }), event('failed', { message: 'x' })];
    const during = await ask(cookie, courseId, { message: 'And an index?' });
    expect(names(during.events)).toEqual(['session', 'token', 'failed']);

    const { sessionId } = chatStreamEvents.session.parse(during.events[0]!.data);
    const saved = await prisma.chatMessage.findMany({ where: { sessionId } });
    expect(saved.map((m) => m.role)).toEqual(['USER']); // no half answer stored
  });

  it('stops the AI answer when the student leaves, and frees the slot', async () => {
    const { courseId } = await makeCourse();
    const { cookie } = await student(courseId);
    let release!: () => void;
    const forever = new Promise<void>((resolve) => (release = resolve));
    ai.script = () => [event('token', { text: 'A join' }), forever];

    const leaving = new AbortController();
    const res = await fetch(`${baseUrl}/api/v1/courses/${courseId}/chat`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'What is a join?' }),
      signal: leaving.signal,
    });
    const reader = res.body!.getReader();
    await reader.read(); // the stream has started
    leaving.abort();
    await expect.poll(() => ai.signals[0]?.aborted, { timeout: 2000 }).toBe(true);
    release();

    ai.script = () => [done('ok', [])];
    const next = await ask(cookie, courseId, { message: 'Still there?' });
    expect(names(next.events)).toEqual(['session', 'done']);
  });

  it('allows only enrolled students of published courses, in their own conversations', async () => {
    const { courseId } = await makeCourse();
    const draft = await makeCourse('DRAFT');
    const outsider = await student();
    const owner = await student(courseId);
    const intruder = await student(courseId);
    ai.script = () => [done('ok', [])];
    const http = () => request(app.getHttpServer());

    await http().post(`/api/v1/courses/${courseId}/chat`).send({ message: 'hi' }).expect(401);
    const notEnrolled = await http()
      .post(`/api/v1/courses/${courseId}/chat`)
      .set('Cookie', outsider.cookie)
      .send({ message: 'hi' })
      .expect(403);
    expect(notEnrolled.body.message).toMatch(/Enroll in this course/);
    await http()
      .post(`/api/v1/courses/${draft.courseId}/chat`)
      .set('Cookie', owner.cookie)
      .send({ message: 'hi' })
      .expect(404);
    for (const body of [
      { message: '   ' },
      { message: 'x'.repeat(2001) },
      { message: 'hi', x: 1 },
    ]) {
      await http()
        .post(`/api/v1/courses/${courseId}/chat`)
        .set('Cookie', owner.cookie)
        .send(body)
        .expect(400);
    }
    expect(ai.requests).toEqual([]); // nothing reached the AI service

    const { events } = await ask(owner.cookie, courseId, { message: 'mine' });
    const { sessionId } = chatStreamEvents.session.parse(events[0]!.data);
    await http()
      .post(`/api/v1/courses/${courseId}/chat`)
      .set('Cookie', intruder.cookie)
      .send({ sessionId, message: 'reading yours' })
      .expect(404);
    await http()
      .get(`/api/v1/courses/${courseId}/chat/sessions/${sessionId}`)
      .set('Cookie', intruder.cookie)
      .expect(404);
    const theirs = await http()
      .get(`/api/v1/courses/${courseId}/chat/sessions`)
      .set('Cookie', intruder.cookie)
      .expect(200);
    expect(theirs.body).toEqual([]);
  });

  it('answers one question at a time per student', async () => {
    const { courseId } = await makeCourse();
    const { cookie } = await student(courseId);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    ai.script = () => [gate, done('first', [])];
    const first = ask(cookie, courseId, { message: 'first' });
    await expect.poll(() => ai.requests.length).toBe(1);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/chat`)
      .set('Cookie', cookie)
      .send({ message: 'second' })
      .expect(429);
    expect(second.body.message).toMatch(/still being answered/);
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);
    release();
    expect(names((await first).events)).toEqual(['session', 'done']);
  });

  it('limits questions per student per minute and per hour', async () => {
    const limiter = app.get(ChatRateLimiter);
    const userId = `${scope.prefix}limits`;
    const minute = CHAT_LIMITS[0];
    const now = Date.UTC(2026, 9, 11, 12, 0, 10); // 10 s into a minute
    for (let i = 0; i < minute.limit; i++) {
      const slot = await limiter.acquire(userId, now);
      expect(slot.ok).toBe(true);
      if (slot.ok) await slot.release();
    }
    const refused = await limiter.acquire(userId, now);
    expect(refused).toEqual({ ok: false, reason: 'limit', retryAfterSec: 50 });
    const nextMinute = await limiter.acquire(userId, now + 60_000);
    expect(nextMinute.ok).toBe(true);
    if (nextMinute.ok) await nextMinute.release();
  });
});
