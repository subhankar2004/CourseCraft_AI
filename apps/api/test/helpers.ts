import { randomUUID } from 'node:crypto';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import type { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** Every e2e fixture uses this marker so afterAll can delete exactly what a suite created. */
export const E2E_EMAIL_DOMAIN = '@e2e.coursecraft.test';
export const E2E_PREFIX = 'e2e-';
export const TEST_PASSWORD = 'a-long-test-password';

let ipCounter = 0;
/** A distinct client IP per call, so per-IP rate limits never leak between tests (TRUST_PROXY=1). */
export const newIp = () => `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
export const uniqueId = () => randomUUID().slice(0, 8);

export async function createTestApp(...extraModules: Type[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...extraModules],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

/** Creates a user directly in the database and returns its session cookie. */
export async function signInAs(app: INestApplication, role: Role) {
  const prisma = app.get(PrismaService);
  const email = `${role.toLowerCase()}-${uniqueId()}${E2E_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: { email, name: `E2E ${role}`, role, passwordHash: await hashPassword(TEST_PASSWORD) },
  });
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', newIp())
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  const cookie = ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith('cc_session='))!
    .split(';')[0]!;
  return { user, cookie };
}

/** Deletes everything created with the e2e markers, children first (FK RESTRICT). */
export async function cleanupE2eData(prisma: PrismaService): Promise<void> {
  await prisma.course.deleteMany({ where: { slug: { startsWith: E2E_PREFIX } } });
  await prisma.domain.deleteMany({ where: { slug: { startsWith: E2E_PREFIX } } });
  await prisma.video.deleteMany({ where: { youtubeId: { startsWith: E2E_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: E2E_EMAIL_DOMAIN } } });
}
