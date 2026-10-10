import { Body, Controller, Get, type INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { apiHealthSchema, errorResponseSchema } from '@coursecraft/shared';
import { IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Public } from '../src/auth/auth.decorators.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Test-only routes to exercise the global pipe and exception filter.
class EchoDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  count!: number;
}

@Public()
@Controller('test')
class TestController {
  @Post('echo')
  echo(@Body() body: EchoDto) {
    return body;
  }

  @Get('boom')
  boom() {
    throw new Error('secret internal detail');
  }
}

@Module({ controllers: [TestController] })
class TestModule {}

describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TestModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('returns ok with the database up (needs PostgreSQL: pnpm infra:up)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      const body = apiHealthSchema.parse(res.body);
      expect(body.status).toBe('ok');
      expect(body.details.database?.status).toBe('up');
    });

    it('is only served under the /api/v1 prefix', async () => {
      await request(app.getHttpServer()).get('/health').expect(404);
    });
  });

  describe('request id', () => {
    it('generates one when absent', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('propagates a valid incoming id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('x-request-id', 'trace-abc.123');
      expect(res.headers['x-request-id']).toBe('trace-abc.123');
    });

    it('replaces an unsafe incoming id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('x-request-id', 'bad id<script>');
      expect(res.headers['x-request-id']).not.toBe('bad id<script>');
    });
  });

  describe('error shape', () => {
    it('returns the standard body for unknown routes', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
      expect(errorResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
        path: '/api/v1/nope',
      });
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
      expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('hides internal error details', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/test/boom').expect(500);
      expect(res.body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
      expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
    });
  });

  describe('validation', () => {
    it('accepts and transforms a valid body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/test/echo')
        .send({ name: 'a', count: 2 })
        .expect(201);
      expect(res.body).toEqual({ name: 'a', count: 2 });
    });

    it('rejects invalid fields with a 400 and a message list', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/test/echo')
        .send({ name: 1, count: 0 })
        .expect(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('name'), expect.stringContaining('count')]),
      );
    });

    it('rejects unknown properties', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/test/echo')
        .send({ name: 'a', count: 1, isAdmin: true })
        .expect(400);
      expect(res.body.message).toEqual([expect.stringContaining('isAdmin')]);
    });
  });

  describe('CORS', () => {
    it('allows the configured web origin with credentials', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:3000');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not allow other origins', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', 'https://evil.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

describe('API (e2e) with the database unavailable', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
        $disconnect: () => Promise.resolve(),
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the database as down with HTTP 503', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    const body = apiHealthSchema.parse(res.body);
    expect(body.status).toBe('error');
    expect(body.details.database).toMatchObject({
      status: 'down',
      message: 'Database unreachable',
    });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });
});
