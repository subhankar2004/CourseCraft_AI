import { randomUUID } from 'node:crypto';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import type { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const TEST_PASSWORD = 'a-long-test-password';

let ipCounter = 0;
/** A distinct client IP per call, so per-IP rate limits never leak between tests (TRUST_PROXY=1). */
export const newIp = () => `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
export const uniqueId = () => randomUUID().slice(0, 8);

/**
 * Per-suite fixture markers. Vitest runs test files in parallel against one database, so each
 * suite must create and clean up only its own data, never another suite's (or the seed's).
 */
export interface E2eScope {
  /** Prefix for slugs and YouTube ids, e.g. `e2e-1a2b3c4d-`. */
  prefix: string;
  /** Email domain for users, e.g. `@e2e-1a2b3c4d.coursecraft.test`. */
  emailDomain: string;
}

export function createE2eScope(): E2eScope {
  const id = uniqueId();
  return { prefix: `e2e-${id}-`, emailDomain: `@e2e-${id}.coursecraft.test` };
}

export async function createTestApp(...extraModules: Type[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...extraModules],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

/** Creates a user directly in the database and returns it with its session cookie. */
export async function signInAs(app: INestApplication, scope: E2eScope, role: Role) {
  const prisma = app.get(PrismaService);
  const email = `${role.toLowerCase()}-${uniqueId()}${scope.emailDomain}`;
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

/** Deletes this suite's fixtures, children first (FK RESTRICT). */
export async function cleanupE2eData(prisma: PrismaService, scope: E2eScope): Promise<void> {
  await prisma.course.deleteMany({ where: { slug: { startsWith: scope.prefix } } });
  await prisma.course.deleteMany({
    where: { createdBy: { email: { endsWith: scope.emailDomain } } },
  });
  await prisma.domain.deleteMany({ where: { slug: { startsWith: scope.prefix } } });
  await prisma.video.deleteMany({ where: { youtubeId: { startsWith: scope.prefix } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: scope.emailDomain } } });
}
