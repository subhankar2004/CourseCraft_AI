import { defineConfig } from 'vitest/config';

// Tests never read the developer's .env (see app.module.ts); they get a fixed,
// valid environment instead so runs are hermetic and reproducible.
export const testEnv = {
  NODE_ENV: 'test',
  API_PORT: '4000',
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://coursecraft:coursecraft@localhost:5432/coursecraft_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-characters-long',
  AI_SERVICE_URL: 'http://localhost:8000',
  INTERNAL_API_KEY: 'test-internal-key-that-is-at-least-32-characters',
  JWT_EXPIRES_IN: '1h',
  // Lets each test act as a different client IP (X-Forwarded-For) so rate limits don't collide.
  TRUST_PROXY: '1',
  // Parallel e2e files must not consume each other's (or the dev server's) generation jobs; the
  // ingestion tests start their own worker.
  INGESTION_WORKER: 'false',
  QUEUE_PREFIX: 'cc-test',
};

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    env: testEnv,
  },
});
