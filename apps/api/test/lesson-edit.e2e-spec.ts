import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { lessonDetailSchema, type CognitiveLoadRequest } from '@coursecraft/shared';
import request from 'supertest';
import { AiClient } from '../src/ai/ai-client.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { CourseStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FAKE_LOAD, fail } from './fake-ai.js';
import { cleanupE2eData, createE2eScope, signInAs } from './helpers.js';

const scope = createE2eScope();
const SID = scope.prefix.slice(4, 12);

describe('PATCH /lessons/:id (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let student: string;
  let adminId: string;
  let domainId: string;
  let n = 0;
  // The AI service's measuring endpoint (#43), scripted: an index from the notes' length.
  const measured: CognitiveLoadRequest[] = [];
  let aiDown = false;
  const ai = {
    cognitiveLoad: async (body: CognitiveLoadRequest) => {
      if (aiDown) throw fail('unavailable', 'connection refused');
      measured.push(body);
      return { ...FAKE_LOAD, index: Math.min(body.notesMarkdown.length, 100) };
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiClient)
      .useValue(ai)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const signedIn = await signInAs(app, scope, 'ADMIN');
    admin = signedIn.cookie;
    adminId = signedIn.user.id;
    student = (await signInAs(app, scope, 'STUDENT')).cookie;
    domainId = (
      await prisma.domain.create({ data: { slug: `${scope.prefix}d`, name: `D ${SID}` } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma, scope);
    await prisma.video.deleteMany({ where: { youtubeId: { startsWith: SID } } });
    await app.close();
  });

  /** A lesson on a 4-minute (240 s) video. */
  async function makeLesson(status: CourseStatus = 'DRAFT') {
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
      data: { courseId: course.id, title: 'M', order: 0 },
    });
    const video = await prisma.video.create({
      data: {
        youtubeId: `${SID}v${String(n).padStart(2, '0')}`,
        title: 'Video',
        durationSec: 240,
        transcriptSource: 'YT_MANUAL',
        transcript: [],
      },
    });
    return prisma.lesson.create({
      data: {
        moduleId: module.id,
        videoId: video.id,
        title: 'AI title',
        order: 0,
        notesMarkdown: '## Summary\\nAI notes [▶ 0:05]',
        keyConcepts: ['Database'],
        readingTimeMin: 1,
      },
    });
  }

  const patch = (id: string, body: object, cookie = admin) =>
    request(app.getHttpServer()).patch(`/api/v1/lessons/${id}`).set('Cookie', cookie).send(body);

  it('saves the edits and recomputes the reading time', async () => {
    const lesson = await makeLesson();
    const notes = `## What is a database [▶ 0:05]\n${'word '.repeat(450)}\n\`\`\`sql\nSELECT '[▶ 9:99]';\n\`\`\`\nRecap [▶ 3:59]`;
    const res = await patch(lesson.id, {
      title: '  What is a database?  ',
      summary: 'Databases store information.',
      keyConcepts: ['Database', 'DBMS', 'Database'],
      notesMarkdown: notes,
    }).expect(200);
    const updated = lessonDetailSchema.parse(res.body);
    expect(updated).toMatchObject({
      title: 'What is a database?',
      summary: 'Databases store information.',
      keyConcepts: ['Database', 'DBMS'], // duplicates removed
      readingTimeMin: 3, // ~460 words at 200 wpm
    });
    // What the lesson page reads (GET /lessons/:id) now has the edited notes.
    const read = await request(app.getHttpServer())
      .get(`/api/v1/lessons/${lesson.id}`)
      .set('Cookie', admin)
      .expect(200);
    expect(read.body.notesMarkdown).toContain('## What is a database [▶ 0:05]');
  });

  it('re-measures the cognitive load when the notes change (#43)', async () => {
    const lesson = await makeLesson();
    await prisma.lesson.update({
      where: { id: lesson.id },
      data: { cognitiveLoad: { ...FAKE_LOAD, index: 77 } },
    });
    const notes = '## Joins [▶ 0:30]\nShort.';
    await patch(lesson.id, { notesMarkdown: notes, keyConcepts: ['Join'] }).expect(200);
    expect(measured.at(-1)).toEqual({ notesMarkdown: notes, keyConcepts: ['Join'] });
    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.cognitiveLoad).toMatchObject({ index: notes.length, simplified: false });

    // A title change leaves the notes, and their measure, alone.
    const calls = measured.length;
    await patch(lesson.id, { title: 'Renamed' }).expect(200);
    expect(measured.length).toBe(calls);

    // The AI service is down: the edit is saved, the outdated measure is cleared.
    aiDown = true;
    try {
      await patch(lesson.id, { notesMarkdown: '## Other [▶ 0:40]\nText.' }).expect(200);
    } finally {
      aiDown = false;
    }
    const after = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(after.notesMarkdown).toContain('Other');
    expect(after.cognitiveLoad).toBeNull();
  });

  it('rejects anchors outside the video and keeps the old notes', async () => {
    const lesson = await makeLesson();
    const res = await patch(lesson.id, {
      notesMarkdown: 'Start [▶ 0:10]\nLate [▶ 4:01] [▶ 1:00:00]',
    }).expect(400);
    expect(res.body.message).toEqual([
      'notesMarkdown: [▶ 4:01] is not a valid time in this video (it ends at 4:00)',
      'notesMarkdown: [▶ 1:00:00] is not a valid time in this video (it ends at 4:00)',
    ]);
    const after = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(after.notesMarkdown).toBe(lesson.notesMarkdown);
  });

  it('validates the body', async () => {
    const lesson = await makeLesson();
    await patch(lesson.id, {}).expect(400);
    await patch(lesson.id, { notesMarkdown: '   ' }).expect(400);
    await patch(lesson.id, { title: '' }).expect(400);
    await patch(lesson.id, { keyConcepts: Array.from({ length: 21 }, (_, i) => `c${i}`) }).expect(
      400,
    );
    await patch(lesson.id, { videoId: 'x' }).expect(400); // unknown fields are refused
  });

  it('is for admins, and not while the course is generating', async () => {
    const lesson = await makeLesson();
    await patch(lesson.id, { title: 'x' }, student).expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/lessons/${lesson.id}`)
      .send({ title: 'x' })
      .expect(401);
    await patch('nope', { title: 'x' }).expect(404);
    const generating = await makeLesson('GENERATING');
    await patch(generating.id, { title: 'x' }).expect(409);
  });
});
