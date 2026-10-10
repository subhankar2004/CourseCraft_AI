import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The application's single PrismaClient (one connection pool per process).
 * Prisma 7 connects through the `pg` driver adapter. Connections open lazily on the first
 * query, so the API still boots (and reports `database: down` on /health) if PostgreSQL is
 * unavailable, and the pool is closed on shutdown (enableShutdownHooks in app.setup.ts).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
