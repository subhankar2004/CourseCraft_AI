import type { INestApplication } from '@nestjs/common';
import { domainDetailSchema, domainSchema, errorResponseSchema } from '@coursecraft/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupE2eData, createE2eScope, createTestApp, signInAs, uniqueId } from './helpers.js';

// Needs PostgreSQL with migrations applied to TEST_DATABASE_URL (pnpm infra:up; CI does this).
// Tolerates other data in the database (e.g. the seed): assertions only target e2e fixtures.

describe('Domains (e2e)', () => {
  const scope = createE2eScope();
  const E2E_PREFIX = scope.prefix;
  let app: INestApplication;
  let prisma: PrismaService;
  let adminCookie: string;
  let studentCookie: string;
  let adminId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await signInAs(app, scope, 'ADMIN');
    adminCookie = admin.cookie;
    adminId = admin.user.id;
    studentCookie = (await signInAs(app, scope, 'STUDENT')).cookie;
  });

  afterAll(async () => {
    await cleanupE2eData(prisma, scope);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  // Names start with the suite prefix so their generated slugs are cleaned up by this suite.
  const newName = () => `${E2E_PREFIX}domain ${uniqueId()}`;

  /** A domain with one published course (2 lessons) and one draft course. */
  async function domainWithCourses() {
    const id = uniqueId();
    const domain = await prisma.domain.create({
      data: { slug: `${E2E_PREFIX}dom-${id}`, name: `E2E Courses ${id}` },
    });
    const video = await prisma.video.create({
      data: {
        youtubeId: `${E2E_PREFIX}${id}`,
        title: 'Video',
        durationSec: 60,
        transcriptSource: 'YT_AUTO',
        transcript: [],
      },
    });
    const base = {
      domainId: domain.id,
      createdById: adminId,
      llmModel: 'test',
      embeddingModel: 'test',
    };
    await prisma.course.create({
      data: {
        ...base,
        slug: `${E2E_PREFIX}pub-${id}`,
        title: 'Published course',
        status: 'PUBLISHED',
        modules: {
          create: {
            order: 1,
            title: 'M1',
            lessons: {
              create: [1, 2].map((order) => ({
                order,
                title: `L${order}`,
                notesMarkdown: '# notes',
                videoId: video.id,
              })),
            },
          },
        },
      },
    });
    await prisma.course.create({
      data: { ...base, slug: `${E2E_PREFIX}draft-${id}`, title: 'Draft course', status: 'DRAFT' },
    });
    return domain;
  }

  describe('public reads', () => {
    it('lists domains with published-course counts, sorted by name, without a session', async () => {
      const domain = await domainWithCourses();
      const res = await http().get('/api/v1/domains').expect(200);
      const list = domainSchema.array().parse(res.body);
      const ours = list.find((d) => d.id === domain.id)!;
      expect(ours.courseCount).toBe(1); // the draft is not counted
      const names = list.map((d) => d.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('returns a domain with only its published courses and their lesson counts', async () => {
      const domain = await domainWithCourses();
      const res = await http().get(`/api/v1/domains/${domain.slug}`).expect(200);
      const detail = domainDetailSchema.parse(res.body);
      expect(detail.courses.map((c) => c.title)).toEqual(['Published course']);
      expect(detail.courses[0]!.lessonCount).toBe(2);
    });

    it('404s for an unknown slug', async () => {
      const res = await http().get('/api/v1/domains/no-such-domain').expect(404);
      expect(errorResponseSchema.parse(res.body).message).toMatch(/not found/);
    });
  });

  describe('admin writes', () => {
    it('creates a domain with a generated slug, de-duplicating clashes', async () => {
      const id = uniqueId();
      await prisma.domain.create({
        data: { slug: `${E2E_PREFIX}cloud-${id}`, name: `Seeded ${id}` },
      });
      const res = await http()
        .post('/api/v1/domains')
        .set('Cookie', adminCookie)
        .send({ name: `${E2E_PREFIX}cloud ${id}`, description: 'Infra and cloud' })
        .expect(201);
      expect(domainSchema.parse(res.body)).toMatchObject({
        slug: `${E2E_PREFIX}cloud-${id}-2`,
        courseCount: 0,
        description: 'Infra and cloud',
      });
    });

    it('rejects a duplicate name (case-insensitive) and a taken explicit slug with 409', async () => {
      const name = newName();
      const first = await http()
        .post('/api/v1/domains')
        .set('Cookie', adminCookie)
        .send({ name })
        .expect(201);
      await http()
        .post('/api/v1/domains')
        .set('Cookie', adminCookie)
        .send({ name: name.toUpperCase() })
        .expect(409);
      await http()
        .post('/api/v1/domains')
        .set('Cookie', adminCookie)
        .send({ name: newName(), slug: first.body.slug })
        .expect(409);
    });

    it('validates input and lists every problem', async () => {
      const res = await http()
        .post('/api/v1/domains')
        .set('Cookie', adminCookie)
        .send({ name: 'x', slug: 'Bad Slug', courseCount: 5 })
        .expect(400);
      const text = JSON.stringify(res.body.message);
      expect(text).toMatch(/name/);
      expect(text).toMatch(/slug/);
      expect(text).toMatch(/courseCount/);
    });

    it('updates name and description but keeps the slug unless one is given', async () => {
      const created = await http()
        .post('/api/v1/domains')
        .set('Cookie', adminCookie)
        .send({ name: newName() })
        .expect(201);
      const renamed = newName();
      const res = await http()
        .patch(`/api/v1/domains/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ name: renamed, description: null })
        .expect(200);
      expect(res.body).toMatchObject({ name: renamed, slug: created.body.slug, description: null });

      const slug = `${E2E_PREFIX}renamed-${uniqueId()}`;
      const moved = await http()
        .patch(`/api/v1/domains/${created.body.id}`)
        .set('Cookie', adminCookie)
        .send({ slug })
        .expect(200);
      expect(moved.body.slug).toBe(slug);
    });

    it('deletes an empty domain but refuses one that has courses', async () => {
      const empty = await http()
        .post('/api/v1/domains')
        .set('Cookie', adminCookie)
        .send({ name: newName() })
        .expect(201);
      await http()
        .delete(`/api/v1/domains/${empty.body.id}`)
        .set('Cookie', adminCookie)
        .expect(204);
      await http().get(`/api/v1/domains/${empty.body.slug}`).expect(404);

      const busy = await domainWithCourses();
      const res = await http()
        .delete(`/api/v1/domains/${busy.id}`)
        .set('Cookie', adminCookie)
        .expect(409);
      expect(res.body.message).toMatch(/still has 2 course\(s\)/); // drafts count too
    });

    it('404s when updating or deleting an unknown domain', async () => {
      await http()
        .patch('/api/v1/domains/nope')
        .set('Cookie', adminCookie)
        .send({ name: newName() })
        .expect(404);
      await http().delete('/api/v1/domains/nope').set('Cookie', adminCookie).expect(404);
    });
  });

  describe('authorisation', () => {
    it('requires a session (401) and the ADMIN role (403) for writes', async () => {
      const body = { name: newName() };
      await http().post('/api/v1/domains').send(body).expect(401);
      await http().post('/api/v1/domains').set('Cookie', studentCookie).send(body).expect(403);
      await http().patch('/api/v1/domains/any').set('Cookie', studentCookie).send(body).expect(403);
      await http().delete('/api/v1/domains/any').set('Cookie', studentCookie).expect(403);
    });
  });
});
