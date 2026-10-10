import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { LoggerModule } from './common/logging/logger.module.js';
import { DomainsModule } from './domains/domains.module.js';
import { validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

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
    AuthModule,
    HealthModule,
    DomainsModule,
  ],
})
export class AppModule {}
