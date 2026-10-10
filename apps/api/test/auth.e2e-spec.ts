import { randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { errorResponseSchema, userSchema } from '@coursecraft/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Roles } from '../src/auth/auth.decorators.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { cleanupE2eData, createE2eScope, newIp } from './helpers.js';

// Needs PostgreSQL with migrations applied to TEST_DATABASE_URL (pnpm infra:up; CI does this).

@Controller('test-admin')
class AdminOnlyController {
  @Get()
  @Roles('ADMIN')
  secret() {
    return { ok: true };
  }
}

@Module({ controllers: [AdminOnlyController] })
class AdminOnlyModule {}

const scope = createE2eScope();
const PASSWORD = 'a-long-test-password';
const newEmail = () => `user-${randomUUID()}${scope.emailDomain}`;

function sessionCookie(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((c) => c.startsWith('cc_session='));
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AdminOnlyModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupE2eData(prisma, scope);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  function register(email = newEmail(), ip = newIp()) {
    return http()
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ email, password: PASSWORD, name: 'Test User' });
  }

  describe('register → me → logout', () => {
    it('creates a STUDENT, starts a secure session, and never returns the hash', async () => {
      const email = newEmail();
      const res = await register(email.toUpperCase()).expect(201);

      const user = userSchema.parse(res.body);
      expect(user).toMatchObject({ email, role: 'STUDENT', name: 'Test User' });
      expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);

      const cookie = sessionCookie(res)!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).toMatch(/Max-Age=3600/);
      expect(cookie).not.toMatch(/Secure/); // only in production

      const me = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
      expect(me.body).toEqual(res.body);

      const out = await http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
      expect(sessionCookie(out)).toMatch(/cc_session=;/);
    });

    it('reports the session on /auth/session without ever returning 401', async () => {
      const anonymous = await http().get('/api/v1/auth/session').expect(200);
      expect(anonymous.body).toEqual({ user: null });
      const garbage = await http()
        .get('/api/v1/auth/session')
        .set('Cookie', 'cc_session=not.a.jwt')
        .expect(200);
      expect(garbage.body).toEqual({ user: null });

      const res = await register().expect(201);
      const signedIn = await http()
        .get('/api/v1/auth/session')
        .set('Cookie', sessionCookie(res)!)
        .expect(200);
      expect(signedIn.body.user).toEqual(res.body);
    });

    it('never rate-limits /auth/session (it runs on every page view)', async () => {
      const ip = newIp();
      for (let i = 0; i < 30; i++) {
        await http().get('/api/v1/auth/session').set('X-Forwarded-For', ip).expect(200);
      }
    });

    it('rejects /me without a session using the standard error body', async () => {
      const res = await http().get('/api/v1/auth/me').expect(401);
      expect(errorResponseSchema.parse(res.body).message).toBe('Not signed in');
    });
  });

  describe('register validation', () => {
    it('rejects a duplicate email, case-insensitively', async () => {
      const email = newEmail();
      await register(email).expect(201);
      const res = await register(email.toUpperCase()).expect(409);
      expect(res.body.message).toBe('An account with this email already exists');
    });

    it('rejects a self-assigned role (mass assignment) without creating a user', async () => {
      const email = newEmail();
      const res = await http()
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', newIp())
        .send({ email, password: PASSWORD, name: 'Mallory', role: 'ADMIN' })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(/role/);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('lists every invalid field', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', newIp())
        .send({ email: 'nope', password: 'short', name: '' })
        .expect(400);
      const text = JSON.stringify(res.body.message);
      expect(text).toMatch(/email/);
      expect(text).toMatch(/at least 12 characters/);
      expect(text).toMatch(/Name is required/);
    });
  });

  describe('login', () => {
    it('signs in with the right password', async () => {
      const email = newEmail();
      await register(email).expect(201);
      const res = await http()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', newIp())
        .send({ email, password: PASSWORD })
        .expect(200);
      expect(res.body.email).toBe(email);
      expect(sessionCookie(res)).toBeDefined();
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const email = newEmail();
      await register(email).expect(201);
      const wrong = await http()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', newIp())
        .send({ email, password: 'wrong-password-123' })
        .expect(401);
      const unknown = await http()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', newIp())
        .send({ email: newEmail(), password: 'wrong-password-123' })
        .expect(401);
      expect(wrong.body.message).toBe('Invalid email or password');
      expect(unknown.body.message).toBe(wrong.body.message);
      expect(sessionCookie(wrong)).toBeUndefined();
    });

    it('rate-limits repeated attempts from one IP (429) without affecting other IPs', async () => {
      const ip = newIp();
      const attempt = (from: string) =>
        http()
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', from)
          .send({ email: newEmail(), password: 'wrong-password-123' });
      for (let i = 0; i < 5; i++) await attempt(ip).expect(401);
      const blocked = await attempt(ip).expect(429);
      expect(errorResponseSchema.safeParse(blocked.body).success).toBe(true);
      await attempt(newIp()).expect(401);
    });
  });

  describe('session tokens', () => {
    it('rejects a tampered or foreign-signed token', async () => {
      const res = await register().expect(201);
      const token = sessionCookie(res)!.split(';')[0]!.slice('cc_session='.length);
      const [header, payload] = token.split('.');
      const forged = new JwtService({ secret: 'x'.repeat(48) }).sign(
        { sub: res.body.id, role: 'ADMIN' },
        { issuer: 'coursecraft-api', audience: 'coursecraft-web' },
      );
      for (const bad of [`${header}.${payload}.invalidsignature`, forged]) {
        await http().get('/api/v1/auth/me').set('Cookie', `cc_session=${bad}`).expect(401);
      }
    });

    it("ends a deleted user's session immediately", async () => {
      const res = await register().expect(201);
      await prisma.user.delete({ where: { id: res.body.id } });
      await http().get('/api/v1/auth/me').set('Cookie', sessionCookie(res)!).expect(401);
    });
  });

  describe('roles', () => {
    it('allows admins, forbids students (403), and requires a session (401)', async () => {
      const student = await register().expect(201);
      await http().get('/api/v1/test-admin').set('Cookie', sessionCookie(student)!).expect(403);
      await http().get('/api/v1/test-admin').expect(401);

      const email = newEmail();
      await prisma.user.create({
        data: { email, name: 'Admin', role: 'ADMIN', passwordHash: await hashPassword(PASSWORD) },
      });
      const admin = await http()
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', newIp())
        .send({ email, password: PASSWORD })
        .expect(200);
      const ok = await http().get('/api/v1/test-admin').set('Cookie', sessionCookie(admin)!);
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ ok: true });
    });
  });
});
