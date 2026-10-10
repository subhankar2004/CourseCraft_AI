import type { INestApplication } from '@nestjs/common';
import {
  courseDetailSchema,
  courseListSchema,
  errorResponseSchema,
  lessonDetailSchema,
} from '@coursecraft/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupE2eData, createE2eScope, createTestApp, signInAs } from './helpers.js';

// Needs PostgreSQL with migrations applied to TEST_DATABASE_URL (pnpm infra:up; CI does this).

describe('Courses & lessons (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let studentCookie: string;
  let adminCookie: string;

  const scope = createE2eScope();
  const P = scope.prefix;
  const id = P.slice(4, 12);
  const domainSlug = `${P}catalog`;
  const slugs = {
    sql: `${P}sql`,
    graphs: `${P}graphs`,
    nets: `${P}nets`,
    draft: `${P}draft`,
  };
  /** Lesson ids in course order: M1.L1, M1.L2, M2.L1. */
  let lessonIds: string[] = [];
  let draftLessonId = '';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await signInAs(app, scope, 'ADMIN');
    adminCookie = admin.cookie;
    studentCookie = (await signInAs(app, scope, 'STUDENT')).cookie;

    const domain = await prisma.domain.create({
      data: { slug: domainSlug, name: `E2E Catalog ${id}` },
    });
    const [videoA, videoB] = await Promise.all(
      [600, 900].map((durationSec, i) =>
        prisma.video.create({
          data: {
            youtubeId: `${P}v${i}`,
            title: `Video ${i}`,
            channel: 'E2E Channel',
            durationSec,
            transcriptSource: 'YT_AUTO',
            transcript: [],
          },
        }),
      ),
    );
    const base = {
      domainId: domain.id,
      createdById: admin.user.id,
      llmModel: 'test',
      embeddingModel: 'test',
    };
    const lesson = (order: number, title: string, videoId: string) => ({
      order,
      title,
      notesMarkdown: `# ${title}\n\n[▶ 0:30] body`,
      keyConcepts: ['k1'],
      readingTimeMin: 3,
      videoId,
    });

    // Created out of order on purpose: ordering must come from the `order` columns.
    const sql = await prisma.course.create({
      data: {
        ...base,
        slug: slugs.sql,
        title: `E2E SQL Basics ${id}`,
        description: 'Learn joins and normalization',
        level: 'Beginner',
        status: 'PUBLISHED',
        modules: {
          create: [
            {
              order: 2,
              title: 'Module Two',
              lessons: { create: [lesson(1, 'Lesson C', videoB.id)] },
            },
            {
              order: 1,
              title: 'Module One',
              lessons: {
                create: [lesson(2, 'Lesson B', videoA.id), lesson(1, 'Lesson A', videoA.id)],
              },
            },
          ],
        },
      },
      include: { modules: { include: { lessons: true } } },
    });
    const byTitle = (t: string) =>
      sql.modules.flatMap((m) => m.lessons).find((l) => l.title === t)!.id;
    lessonIds = ['Lesson A', 'Lesson B', 'Lesson C'].map(byTitle);

    await prisma.course.create({
      data: {
        ...base,
        slug: slugs.graphs,
        title: `E2E Graph Algorithms ${id}`,
        level: 'Advanced',
        status: 'PUBLISHED',
      },
    });
    await prisma.course.create({
      data: {
        ...base,
        slug: slugs.nets,
        title: `E2E Networks ${id}`,
        level: 'Beginner',
        status: 'PUBLISHED',
      },
    });
    const draft = await prisma.course.create({
      data: {
        ...base,
        slug: slugs.draft,
        title: `E2E Draft ${id}`,
        status: 'DRAFT',
        modules: {
          create: {
            order: 1,
            title: 'Draft module',
            lessons: { create: [lesson(1, 'Draft lesson', videoA.id)] },
          },
        },
      },
      include: { modules: { include: { lessons: true } } },
    });
    draftLessonId = draft.modules[0]!.lessons[0]!.id;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma, scope);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const list = async (query: Record<string, string>) =>
    courseListSchema.parse(
      (
        await http()
          .get('/api/v1/courses')
          .query({ domain: domainSlug, ...query })
          .expect(200)
      ).body,
    );

  describe('GET /courses', () => {
    it('lists published courses of a domain, sorted, with domain and lesson counts', async () => {
      const page = await list({});
      expect(page.items.map((c) => c.slug)).toEqual([slugs.graphs, slugs.nets, slugs.sql]);
      expect(page.total).toBe(3); // the draft is excluded
      const sql = page.items.find((c) => c.slug === slugs.sql)!;
      expect(sql).toMatchObject({
        lessonCount: 3,
        level: 'Beginner',
        domain: { slug: domainSlug },
      });
    });

    it('paginates', async () => {
      const first = await list({ pageSize: '2', page: '1' });
      const second = await list({ pageSize: '2', page: '2' });
      expect(first).toMatchObject({ total: 3, totalPages: 2, page: 1, pageSize: 2 });
      expect(first.items).toHaveLength(2);
      expect(second.items.map((c) => c.slug)).toEqual([slugs.sql]);
    });

    it('searches title and description case-insensitively, and filters by level', async () => {
      expect((await list({ q: 'NORMALIZATION' })).items.map((c) => c.slug)).toEqual([slugs.sql]);
      expect((await list({ q: 'graph' })).items.map((c) => c.slug)).toEqual([slugs.graphs]);
      expect((await list({ level: 'Beginner' })).items.map((c) => c.slug)).toEqual([
        slugs.nets,
        slugs.sql,
      ]);
      expect((await list({ q: 'no-such-course-xyz' })).total).toBe(0);
    });

    it('rejects an invalid query with every problem listed', async () => {
      const res = await http()
        .get('/api/v1/courses')
        .query({ page: '0', level: 'Expert', sort: 'x' })
        .expect(400);
      const text = JSON.stringify(errorResponseSchema.parse(res.body).message);
      expect(text).toMatch(/page/);
      expect(text).toMatch(/level/);
      expect(text).toMatch(/sort/);
    });
  });

  describe('GET /courses/:slug', () => {
    it('returns the ordered outline without lesson bodies', async () => {
      const res = await http().get(`/api/v1/courses/${slugs.sql}`).expect(200);
      const course = courseDetailSchema.parse(res.body);
      expect(course.modules.map((m) => m.title)).toEqual(['Module One', 'Module Two']);
      expect(course.modules[0]!.lessons.map((l) => l.title)).toEqual(['Lesson A', 'Lesson B']);
      expect(course.lessonCount).toBe(3);
      expect(course.totalVideoSec).toBe(1500); // shared video counted once: 600 + 900
      expect(JSON.stringify(res.body)).not.toContain('notesMarkdown');
    });

    it('404s for drafts and unknown slugs', async () => {
      await http().get(`/api/v1/courses/${slugs.draft}`).expect(404);
      await http().get('/api/v1/courses/no-such-course').expect(404);
    });
  });

  describe('GET /lessons/:id', () => {
    it('requires a session', async () => {
      await http().get(`/api/v1/lessons/${lessonIds[0]}`).expect(401);
    });

    it('returns notes, video, context and neighbours across module boundaries', async () => {
      const get = async (lessonId: string) =>
        lessonDetailSchema.parse(
          (await http().get(`/api/v1/lessons/${lessonId}`).set('Cookie', studentCookie).expect(200))
            .body,
        );
      const [a, b, c] = await Promise.all(lessonIds.map(get));

      expect(a).toMatchObject({
        title: 'Lesson A',
        module: { title: 'Module One', order: 1 },
        course: { slug: slugs.sql },
        video: { durationSec: 600, channel: 'E2E Channel' },
        keyConcepts: ['k1'],
        prevLessonId: null,
        nextLessonId: lessonIds[1],
      });
      expect(a.notesMarkdown).toContain('[▶ 0:30]');
      expect(b).toMatchObject({ prevLessonId: lessonIds[0], nextLessonId: lessonIds[2] }); // crosses into Module Two
      expect(c).toMatchObject({ prevLessonId: lessonIds[1], nextLessonId: null });
    });

    it('hides draft lessons from students (404) but lets admins preview them', async () => {
      await http().get(`/api/v1/lessons/${draftLessonId}`).set('Cookie', studentCookie).expect(404);
      const preview = await http()
        .get(`/api/v1/lessons/${draftLessonId}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(preview.body.title).toBe('Draft lesson');
    });

    it('404s for an unknown lesson', async () => {
      await http().get('/api/v1/lessons/nope').set('Cookie', studentCookie).expect(404);
    });
  });
});
