import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';

const TIMEOUT_MS = 1500;

/**
 * Pings PostgreSQL through Prisma. /health is public, so the driver's error text (which can
 * reveal internals) is logged server-side and never returned to the caller.
 */
@Injectable()
export class DatabaseHealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  async isHealthy<const Key extends string>(key: Key) {
    const indicator = this.healthIndicatorService.check(key);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${TIMEOUT_MS}ms`)),
            TIMEOUT_MS,
          );
        }),
      ]);
      return indicator.up();
    } catch (error) {
      const reason = error instanceof Error ? error.message.trim().split('\n')[0] : String(error);
      this.logger.warn(`Database health check failed: ${reason}`);
      return indicator.down({ message: 'Database unreachable' });
    } finally {
      clearTimeout(timer);
    }
  }
}
