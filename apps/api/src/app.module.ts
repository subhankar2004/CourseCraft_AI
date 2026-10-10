import { resolve } from 'node:path';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule, ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { AiClientModule } from './ai/ai-client.module.js';
import { AuthModule } from './auth/auth.module.js';
import { LoggerModule } from './common/logging/logger.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { DomainsModule } from './domains/domains.module.js';
import { type Env, validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { IngestionModule, IngestionWorkerModule } from './ingestion/ingestion.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { REDIS, RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // One shared .env at the repo root (see docs/setup.md); tests use vitest's env instead.
      envFilePath: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
    LoggerModule,
    PrismaModule,
    RedisModule,
    AiClientModule,
    // BullMQ 6 can't load a Redis driver itself under native ESM, so it gets our ioredis client.
    BullModule.forRootAsync({
      inject: [REDIS, ConfigService],
      useFactory: (redis: Redis, config: ConfigService<Env, true>) => ({
        connection: redis,
        prefix: config.get('QUEUE_PREFIX', { infer: true }),
      }),
    }),
    IngestionModule,
    ConditionalModule.registerWhen(
      IngestionWorkerModule,
      (env) => env.INGESTION_WORKER !== 'false',
      { debug: false },
    ),
    AuthModule,
    HealthModule,
    DomainsModule,
    CoursesModule,
  ],
})
export class AppModule {}
