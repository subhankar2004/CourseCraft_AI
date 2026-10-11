import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { adminCourseDetailSchema, courseDetailSchema } from '@coursecraft/shared';
import request from 'supertest';
import { AiServiceError } from '../src/ai/ai-client.errors.js';
import { AiClient } from '../src/ai/ai-client.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { CourseStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupE2eData, createE2eScope, newIp, signInAs } from './helpers.js';

const scope = createE2eScope();
const SID = scope.prefix.slice(4, 12);

/** Records vector deletions; `down` makes the AI service unavailable. */
class FakeAi {
  deleted: string[] = [];
  down = false;
  deleteCourseVectors(courseId: string) {
    if (this.down) {
      return Promise.reject(new AiServiceError('unavailable', 'down', 'DELETE', 'r'));
    }
    this.deleted.push(courseId);
    return Promise.resolve({ courseId, deleted: 3 });
  }
}

describe('Course review (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ai = new FakeAi();
  let admin: string;
  let student: string;
  let adminId: string;
  let domainId: string;
  let otherDomainId: string;
  let counter = 0;

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
      await prisma.domain.create({ data: { slug: `${scope.prefix}a`, name: `A ${SID}` } })
    ).id;
    otherDomainId = (
      await prisma.domain.create({ data: { slug: `${scope.prefix}b`, name: `B ${SID}` } })
    ).id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma, scope);
    await prisma.video.deleteMany({ where: { youtubeId: { startsWith: SID } } });
    await app.close();
  });

  /** A course with modules "M1" (lessons a1, a2) and "M2" (b1, b2), each lesson with a chunk. */
  async function makeCourse(status: CourseStatus = 'DRAFT') {
    const n = ++counter;
    const course = await prisma.course.create({
      data: {
        slug: `${scope.prefix}course-${n}`,
        title: `Course ${n}`,
        status,
        domainId,
        createdById: adminId,
        llmModel: 'llama3.1:8b',
        embeddingModel: 'nomic-embed-text',
      },
    });
    await prisma.ingestionJob.create({
      data: {
        courseId: course.id,
        input: {},
        status: 'SUCCEEDED',
        report: { outlineRepairs: ['lesson 2 was missing; placed after lesson 1'] },
      },
    });
    const lessons: Record<string, string> = {};
    for (const [order, [title, keys]] of [
      ['M1', ['a1', 'a2']],
      ['M2', ['b1', 'b2']],
    ].entries() as IterableIterator<[number, [string, string[]]]>) {
      const module = await prisma.module.create({ data: { courseId: course.id, title, order } });
      for (const [lessonOrder, key] of keys.entries()) {
        const youtubeId = `${SID}${String(n).padStart(1, '0')}${key}`.slice(0, 11).padEnd(11, 'x');
        const video = await prisma.video.upsert({
          where: { youtubeId },
          create: {
            youtubeId,
            title: `Video ${key}`,
            durationSec: 100,
            transcriptSource: 'YT_MANUAL',
            transcript: [],
          },
          update: {},
        });
        const lesson = await prisma.lesson.create({
          data: {
            moduleId: module.id,
            videoId: video.id,
            title: `Lesson ${key}`,
            order: lessonOrder,
            notesMarkdown: '## Notes',
            keyConcepts: [],
          },
        });
        await prisma.chunk.create({
          data: {
            id: `${lesson.id}-0`,
            lessonId: lesson.id,
            index: 0,
            text: 't',
            startSec: 0,
            endSec: 1,
            tokenCount: 1,
          },
        });
        lessons[key] = lesson.id;
      }
    }
    const modules = await prisma.module.findMany({
      where: { courseId: course.id },
      orderBy: { order: 'asc' },
    });
    return { course, lessons, m1: modules[0]!.id, m2: modules[1]!.id };
  }

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({
    get: (path: string) => http().get(`/api/v1${path}`).set('Cookie', cookie),
    patch: (path: string, body: object) =>
      http().patch(`/api/v1${path}`).set('Cookie', cookie).send(body),
    put: (path: string, body: object) =>
      http().put(`/api/v1${path}`).set('Cookie', cookie).send(body),
    post: (path: string) => http().post(`/api/v1${path}`).set('Cookie', cookie),
    delete: (path: string) => http().delete(`/api/v1${path}`).set('Cookie', cookie),
  });

  describe('GET /admin/courses/:id', () => {
    it('returns the outline and the AI outline repairs, for admins only', async () => {
      const { course, m1 } = await makeCourse();
      const res = await as(admin).get(`/admin/courses/${course.id}`).expect(200);
      const detail = adminCourseDetailSchema.parse(res.body);
      expect(detail.modules.map((m) => [m.title, m.lessons.map((l) => l.title)])).toEqual([
        ['M1', ['Lesson a1', 'Lesson a2']],
        ['M2', ['Lesson b1', 'Lesson b2']],
      ]);
      expect(detail.modules[0]?.id).toBe(m1);
      expect(detail.outlineRepairs).toEqual(['lesson 2 was missing; placed after lesson 1']);
      expect([detail.moduleCount, detail.lessonCount]).toEqual([2, 4]);
      await as(student).get(`/admin/courses/${course.id}`).expect(403);
      await as(admin).get('/admin/courses/nope').expect(404);
    });
  });

  describe('PATCH /courses/:id', () => {
    it('edits details, keeping the slug unless given', async () => {
      const { course } = await makeCourse();
      const res = await as(admin)
        .patch(`/courses/${course.id}`, {
          title: 'SQL from scratch',
          description: 'Learn SQL.',
          level: 'Beginner',
          domainId: otherDomainId,
        })
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'SQL from scratch',
        description: 'Learn SQL.',
        level: 'Beginner',
        slug: course.slug,
        domain: { id: otherDomainId },
      });
      await as(admin).patch(`/courses/${course.id}`, { level: null }).expect(200);
    });

    it('reports bad input on its field', async () => {
      const { course } = await makeCourse();
      const taken = await makeCourse();
      const conflict = await as(admin)
        .patch(`/courses/${course.id}`, { slug: taken.course.slug })
        .expect(409);
      expect(conflict.body.message).toBe('slug: already used by another course');
      const unknown = await as(admin)
        .patch(`/courses/${course.id}`, { domainId: 'nope' })
        .expect(400);
      expect(unknown.body.message).toEqual(['domainId: unknown domain']);
      await as(admin).patch(`/courses/${course.id}`, {}).expect(400);
      await as(admin).patch(`/courses/${course.id}`, { title: 'x' }).expect(400);
    });
  });

  describe('PUT /courses/:id/outline', () => {
    it('reorders, moves lessons across modules and renames, in one transaction', async () => {
      const { course, lessons, m1, m2 } = await makeCourse();
      const res = await as(admin)
        .put(`/courses/${course.id}/outline`, {
          modules: [
            { id: m2, title: 'Basics', lessonIds: [lessons.a2, lessons.b2, lessons.b1] },
            { id: m1, title: 'Advanced', lessonIds: [lessons.a1] },
          ],
        })
        .expect(200);
      const detail = adminCourseDetailSchema.parse(res.body);
      expect(
        detail.modules.map((m) => [
          m.id,
          m.title,
          m.order,
          m.lessons.map((l) => [l.title, l.order]),
        ]),
      ).toEqual([
        [
          m2,
          'Basics',
          0,
          [
            ['Lesson a2', 0],
            ['Lesson b2', 1],
            ['Lesson b1', 2],
          ],
        ],
        [m1, 'Advanced', 1, [['Lesson a1', 0]]],
      ]);
      // Chunks follow their lesson (same ids), so citations and vectors stay valid.
      expect(
        await prisma.chunk.count({ where: { lesson: { module: { courseId: course.id } } } }),
      ).toBe(4);
    });

    it('adds a module and removes one that was emptied', async () => {
      const { course, lessons, m1, m2 } = await makeCourse();
      const res = await as(admin)
        .put(`/courses/${course.id}/outline`, {
          modules: [
            { id: m1, title: 'M1', lessonIds: [lessons.a1, lessons.a2, lessons.b1] },
            { title: 'New module', lessonIds: [lessons.b2] },
          ],
        })
        .expect(200);
      const detail = adminCourseDetailSchema.parse(res.body);
      expect(detail.modules.map((m) => [m.title, m.lessons.length])).toEqual([
        ['M1', 3],
        ['New module', 1],
      ]);
      expect(await prisma.module.findUnique({ where: { id: m2 } })).toBeNull();
    });

    it('never loses or duplicates a lesson', async () => {
      const { course, lessons, m1, m2 } = await makeCourse();
      const other = await makeCourse();
      const put = (modules: object[]) =>
        as(admin).put(`/courses/${course.id}/outline`, { modules });
      const missing = await put([
        { id: m1, title: 'M1', lessonIds: [lessons.a1, lessons.a2, lessons.b1] },
      ]).expect(400);
      expect(missing.body.message).toEqual([`every lesson must be placed; missing: ${lessons.b2}`]);
      const twice = await put([
        { id: m1, title: 'M1', lessonIds: [lessons.a1, lessons.a2] },
        { id: m2, title: 'M2', lessonIds: [lessons.b1, lessons.b2, lessons.a1] },
      ]).expect(400);
      expect(twice.body.message).toEqual([`lesson ${lessons.a1}: listed twice`]);
      const foreign = await put([
        {
          id: other.m1,
          title: 'M1',
          lessonIds: [lessons.a1, lessons.a2, lessons.b1, lessons.b2, other.lessons.a1!],
        },
      ]).expect(400);
      expect(foreign.body.message).toEqual([
        'modules.0.id: not a module of this course',
        `lesson ${other.lessons.a1}: not a lesson of this course`,
      ]);
      await put([{ id: m1, title: 'M1', lessonIds: [] }]).expect(400);
      // Nothing changed.
      const after = adminCourseDetailSchema.parse(
        (await as(admin).get(`/admin/courses/${course.id}`)).body,
      );
      expect(after.modules.map((m) => m.lessons.map((l) => l.id))).toEqual([
        [lessons.a1, lessons.a2],
        [lessons.b1, lessons.b2],
      ]);
    });
  });

  describe('publishing', () => {
    it('publishes into the public catalog and unpublishes out of it', async () => {
      const { course } = await makeCourse();
      await http().get(`/api/v1/courses/${course.slug}`).expect(404); // drafts are invisible
      const published = await as(admin).post(`/courses/${course.id}/publish`).expect(200);
      expect(published.body.status).toBe('PUBLISHED');
      const pub = courseDetailSchema.parse(
        (await http().get(`/api/v1/courses/${course.slug}`).expect(200)).body,
      );
      expect(pub.lessonCount).toBe(4);
      await as(admin).post(`/courses/${course.id}/publish`).expect(200); // idempotent
      const unpublished = await as(admin).post(`/courses/${course.id}/unpublish`).expect(200);
      expect(unpublished.body.status).toBe('DRAFT');
      await http().get(`/api/v1/courses/${course.slug}`).expect(404);
    });

    it('refuses courses that are not ready', async () => {
      const failed = await makeCourse('FAILED');
      await as(admin).post(`/courses/${failed.course.id}/publish`).expect(409);
      const { course } = await makeCourse();
      await prisma.module.deleteMany({ where: { courseId: course.id } });
      const empty = await as(admin).post(`/courses/${course.id}/publish`).expect(409);
      expect(empty.body.message).toMatch(/at least one lesson/);
    });

    it('locks a course while it is being generated', async () => {
      const { course, lessons, m1 } = await makeCourse('GENERATING');
      await as(admin).patch(`/courses/${course.id}`, { title: 'New title' }).expect(409);
      await as(admin)
        .put(`/courses/${course.id}/outline`, {
          modules: [{ id: m1, title: 'x', lessonIds: Object.values(lessons) }],
        })
        .expect(409);
      await as(admin).post(`/courses/${course.id}/publish`).expect(409);
      await as(admin).delete(`/courses/${course.id}`).expect(409);
    });

    it('is for admins only', async () => {
      const { course } = await makeCourse();
      await as(student).post(`/courses/${course.id}/publish`).expect(403);
      await http()
        .post(`/api/v1/courses/${course.id}/publish`)
        .set('X-Forwarded-For', newIp())
        .expect(401);
    });
  });

  describe('DELETE /courses/:id', () => {
    it('deletes nothing while the AI service is down', async () => {
      const { course } = await makeCourse();
      ai.down = true;
      try {
        const res = await as(admin).delete(`/courses/${course.id}`).expect(503);
        expect(res.body.message).toMatch(/not deleted/);
      } finally {
        ai.down = false;
      }
      expect(await prisma.course.findUnique({ where: { id: course.id } })).not.toBeNull();
    });

    it('removes the vectors, then the course and everything under it', async () => {
      const { course } = await makeCourse();
      await as(admin).delete(`/courses/${course.id}`).expect(204);
      expect(ai.deleted).toContain(course.id);
      expect(await prisma.course.findUnique({ where: { id: course.id } })).toBeNull();
      expect(await prisma.lesson.count({ where: { module: { courseId: course.id } } })).toBe(0);
      expect(await prisma.ingestionJob.count({ where: { courseId: course.id } })).toBe(0);
      await as(admin).delete(`/courses/${course.id}`).expect(404);
    });
  });
});
