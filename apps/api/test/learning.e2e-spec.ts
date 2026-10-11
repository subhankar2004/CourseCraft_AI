import type { INestApplication } from '@nestjs/common';
import {
  completedLessonSchema,
  lessonProgressSchema,
  myCourseProgressSchema,
  myCourseSchema,
  nextLessonSchema,
} from '@coursecraft/shared';
import request from 'supertest';
import type { CourseStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupE2eData, createE2eScope, createTestApp, signInAs } from './helpers.js';

const scope = createE2eScope();
const SID = scope.prefix.slice(4, 12);

describe('Enrollment, progress and next lesson (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminId: string;
  let domainId: string;
  let n = 0;

  beforeAll(async () => {
    app = await createTestApp();
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

  /** Module "M1" (L1, L2) and "M2" (L3); every video is 100 s long. */
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
    const ids: string[] = [];
    for (const [order, titles] of [['L1', 'L2'], ['L3']].entries()) {
      const module = await prisma.module.create({
        data: { courseId: course.id, title: `M${order + 1}`, order },
      });
      for (const [lessonOrder, title] of titles.entries()) {
        const video = await prisma.video.create({
          data: {
            youtubeId: `${SID}${n}${title}`.padEnd(11, 'x').slice(0, 11),
            title,
            durationSec: 100,
            transcriptSource: 'YT_MANUAL',
            transcript: [],
          },
        });
        const lesson = await prisma.lesson.create({
          data: {
            moduleId: module.id,
            videoId: video.id,
            title,
            order: lessonOrder,
            notesMarkdown: 'n',
            keyConcepts: [],
          },
        });
        ids.push(lesson.id);
      }
    }
    return { course, l1: ids[0]!, l2: ids[1]!, l3: ids[2]! };
  }

  const as = (cookie: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', cookie),
    post: (path: string) =>
      request(app.getHttpServer()).post(`/api/v1${path}`).set('Cookie', cookie),
    put: (path: string, body: object) =>
      request(app.getHttpServer()).put(`/api/v1${path}`).set('Cookie', cookie).send(body),
  });

  it('follows SPEC §7.3 from enrollment to completion', async () => {
    const { course, l1, l2, l3 } = await makeCourse();
    const learner = as((await signInAs(app, scope, 'STUDENT')).cookie);
    const progress = async () =>
      myCourseProgressSchema.parse(
        (await learner.get(`/courses/${course.id}/progress`).expect(200)).body,
      );
    const next = async () =>
      nextLessonSchema.parse((await learner.get(`/courses/${course.id}/next`).expect(200)).body);

    let p = await progress();
    expect([p.enrolled, p.progress, p.next?.id]).toEqual([
      false,
      { completed: 0, total: 3, percent: 0 },
      l1,
    ]);

    const enrolled = await learner.post(`/courses/${course.id}/enroll`).expect(200);
    await learner.post(`/courses/${course.id}/enroll`).expect(200); // idempotent
    expect((await progress()).enrolledAt).toBe(enrolled.body.enrolledAt);

    // Opening L2 marks it in progress; L1 is still the next lesson.
    const opened = lessonProgressSchema.parse(
      (await learner.put(`/lessons/${l2}/progress`, { lastPositionSec: 0 }).expect(200)).body,
    );
    expect(opened).toMatchObject({ status: 'IN_PROGRESS', completedAt: null });
    expect((await next()).lesson).toEqual({ id: l1, title: 'L1', moduleTitle: 'M1' });

    // "Mark complete" on L1.
    const marked = await learner
      .put(`/lessons/${l1}/progress`, { status: 'COMPLETED', lastPositionSec: 12 })
      .expect(200);
    expect(marked.body.course).toMatchObject({ completed: 1, total: 3, percent: 33 });
    expect((await next()).lesson?.id).toBe(l2);

    // Watching 90% of L2 completes it; the next lesson crosses into module 2.
    const watched = await learner
      .put(`/lessons/${l2}/progress`, { lastPositionSec: 95 })
      .expect(200);
    expect(watched.body).toMatchObject({ status: 'COMPLETED', course: { percent: 67 } });
    expect((await next()).lesson).toMatchObject({ id: l3, moduleTitle: 'M2' });

    // Re-watching never undoes a completion; an explicit status does.
    expect(
      (await learner.put(`/lessons/${l2}/progress`, { lastPositionSec: 5 }).expect(200)).body
        .status,
    ).toBe('COMPLETED');
    expect(
      (
        await learner
          .put(`/lessons/${l2}/progress`, { status: 'IN_PROGRESS', lastPositionSec: 5 })
          .expect(200)
      ).body,
    ).toMatchObject({
      status: 'IN_PROGRESS',
      completedAt: null,
    });
    expect((await next()).lesson?.id).toBe(l2);

    for (const id of [l2, l3])
      await learner
        .put(`/lessons/${id}/progress`, { status: 'COMPLETED', lastPositionSec: 0 })
        .expect(200);
    expect(await next()).toEqual({ lesson: null, courseCompleted: true });
    p = await progress();
    expect(p.progress.percent).toBe(100);
    expect(p.lessons.map((l) => l.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);
  });

  it('enrolls automatically when a lesson is studied, and keeps learners apart', async () => {
    const { course, l1 } = await makeCourse();
    const a = as((await signInAs(app, scope, 'STUDENT')).cookie);
    const b = as((await signInAs(app, scope, 'STUDENT')).cookie);
    await a.put(`/lessons/${l1}/progress`, { lastPositionSec: 250 }).expect(200);
    const mine = myCourseProgressSchema.parse((await a.get(`/courses/${course.id}/progress`)).body);
    expect(mine.enrolled).toBe(true);
    expect(mine.lessons[0]).toEqual({ lessonId: l1, status: 'COMPLETED', lastPositionSec: 100 }); // clamped
    const theirs = myCourseProgressSchema.parse(
      (await b.get(`/courses/${course.id}/progress`)).body,
    );
    expect([theirs.enrolled, theirs.progress.completed]).toEqual([false, 0]);
  });

  it('lists my courses with progress, the last lesson and the next one, latest activity first', async () => {
    const older = await makeCourse();
    const newer = await makeCourse();
    const hidden = await makeCourse();
    const learner = as((await signInAs(app, scope, 'STUDENT')).cookie);
    await learner.post(`/courses/${older.course.id}/enroll`).expect(200);
    await learner
      .put(`/lessons/${older.l1}/progress`, { status: 'COMPLETED', lastPositionSec: 0 })
      .expect(200);
    await learner.put(`/lessons/${older.l2}/progress`, { lastPositionSec: 30 }).expect(200);
    await learner.post(`/courses/${hidden.course.id}/enroll`).expect(200);
    await prisma.course.update({ where: { id: hidden.course.id }, data: { status: 'DRAFT' } }); // unpublished later
    await learner.post(`/courses/${newer.course.id}/enroll`).expect(200);

    const mine = myCourseSchema.array().parse((await learner.get('/me/courses').expect(200)).body);
    expect(mine.map((c) => c.course.id)).toEqual([newer.course.id, older.course.id]); // no unpublished course
    expect(mine[1]).toMatchObject({
      progress: { completed: 1, total: 3, percent: 33 },
      lastLesson: { id: older.l2, title: 'L2', status: 'IN_PROGRESS', lastPositionSec: 30 },
      next: { id: older.l2 },
    });
    expect(mine[0]).toMatchObject({
      lastLesson: null,
      next: { id: newer.l1 },
      progress: { percent: 0 },
    });
  });

  it('lists recently completed lessons, newest first, from published courses only', async () => {
    const shown = await makeCourse();
    const hidden = await makeCourse();
    const learner = as((await signInAs(app, scope, 'STUDENT')).cookie);
    const complete = (lessonId: string) =>
      learner.put(`/lessons/${lessonId}/progress`, { status: 'COMPLETED', lastPositionSec: 100 });
    await learner.get('/me/completed-lessons').expect(200, []);

    for (const lessonId of [shown.l1, shown.l3, hidden.l1, shown.l2]) {
      await complete(lessonId).expect(200);
      await new Promise((resolve) => setTimeout(resolve, 5)); // distinct completion times
    }
    // Undone completions and in-progress lessons are not listed.
    await learner
      .put(`/lessons/${shown.l3}/progress`, { status: 'IN_PROGRESS', lastPositionSec: 10 })
      .expect(200);
    await prisma.course.update({ where: { id: hidden.course.id }, data: { status: 'DRAFT' } });

    const list = completedLessonSchema
      .array()
      .parse((await learner.get('/me/completed-lessons').expect(200)).body);
    expect(list.map((l) => [l.title, l.moduleTitle, l.course.slug])).toEqual([
      ['L2', 'M1', shown.course.slug],
      ['L1', 'M1', shown.course.slug],
    ]);
    const limited = await learner.get('/me/completed-lessons?limit=1').expect(200);
    expect(limited.body).toHaveLength(1);
    await learner.get('/me/completed-lessons?limit=0').expect(400);
    await learner.get('/me/completed-lessons?limit=21').expect(400);
    await learner.get('/me/completed-lessons?other=1').expect(400);
    await request(app.getHttpServer()).get('/api/v1/me/completed-lessons').expect(401);
  });

  it('only works on published courses, for signed-in users, with valid input', async () => {
    const draft = await makeCourse('DRAFT');
    const { l1 } = await makeCourse();
    const learner = as((await signInAs(app, scope, 'STUDENT')).cookie);
    await learner.post(`/courses/${draft.course.id}/enroll`).expect(404);
    await learner.get(`/courses/${draft.course.id}/next`).expect(404);
    await learner.put(`/lessons/${draft.l1}/progress`, { lastPositionSec: 0 }).expect(404);
    await learner.put(`/lessons/nope/progress`, { lastPositionSec: 0 }).expect(404);
    await learner.put(`/lessons/${l1}/progress`, { lastPositionSec: -1 }).expect(400);
    await learner
      .put(`/lessons/${l1}/progress`, { status: 'NOT_STARTED', lastPositionSec: 0 })
      .expect(400);
    await learner.put(`/lessons/${l1}/progress`, {}).expect(400);
    await request(app.getHttpServer()).get('/api/v1/me/courses').expect(401);
    await request(app.getHttpServer())
      .put(`/api/v1/lessons/${l1}/progress`)
      .send({ lastPositionSec: 0 })
      .expect(401);
  });
});
