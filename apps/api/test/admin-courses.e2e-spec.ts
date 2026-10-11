import type { INestApplication } from '@nestjs/common';
import { adminCourseSchema } from '@coursecraft/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupE2eData, createE2eScope, createTestApp, signInAs } from './helpers.js';

const scope = createE2eScope();

describe('GET /admin/courses (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let student: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const signedIn = await signInAs(app, scope, 'ADMIN');
    admin = signedIn.cookie;
    student = (await signInAs(app, scope, 'STUDENT')).cookie;
    const domain = await prisma.domain.create({
      data: { slug: `${scope.prefix}d`, name: `E2E ${scope.prefix}` },
    });
    for (const status of ['DRAFT', 'GENERATING', 'PUBLISHED', 'FAILED'] as const) {
      const course = await prisma.course.create({
        data: {
          slug: `${scope.prefix}${status.toLowerCase()}`,
          title: `${status} course`,
          status,
          domainId: domain.id,
          createdById: signedIn.user.id,
          llmModel: 'm',
          embeddingModel: 'e',
        },
      });
      if (status === 'GENERATING' || status === 'FAILED') {
        // An older and a newer job: only the newest is reported.
        await prisma.ingestionJob.create({
          data: { courseId: course.id, input: {}, status: 'FAILED', error: 'old attempt' },
        });
        await prisma.ingestionJob.create({
          data: {
            courseId: course.id,
            input: {},
            status: status === 'FAILED' ? 'FAILED' : 'RUNNING',
            stage: 'NOTES',
            progress: 58,
            error: status === 'FAILED' ? 'every video failed' : null,
            createdAt: new Date(Date.now() + 1000),
          },
        });
      }
    }
  });

  afterAll(async () => {
    await cleanupE2eData(prisma, scope);
    await app.close();
  });

  it('lists courses in every status with their latest job', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/courses')
      .set('Cookie', admin)
      .expect(200);
    const ours = adminCourseSchema
      .array()
      .parse(res.body)
      .filter((c) => c.slug.startsWith(scope.prefix));
    expect(ours.map((c) => c.status).sort()).toEqual([
      'DRAFT',
      'FAILED',
      'GENERATING',
      'PUBLISHED',
    ]);
    const generating = ours.find((c) => c.status === 'GENERATING');
    expect(generating?.latestJob).toMatchObject({
      status: 'RUNNING',
      stage: 'NOTES',
      progress: 58,
    });
    expect(ours.find((c) => c.status === 'FAILED')?.latestJob?.error).toBe('every video failed');
    expect(ours.find((c) => c.status === 'DRAFT')).toMatchObject({
      latestJob: null,
      moduleCount: 0,
      lessonCount: 0,
      domain: { slug: `${scope.prefix}d` },
    });
  });

  it('is for admins only', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/courses').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/courses')
      .set('Cookie', student)
      .expect(403);
  });
});
