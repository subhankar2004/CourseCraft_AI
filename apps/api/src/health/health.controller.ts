import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/auth.decorators.js';
import { AiHealthIndicator } from './ai.health.js';
import { DatabaseHealthIndicator } from './database.health.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly ai: AiHealthIndicator,
  ) {}

  /** Readiness: the API and the services it depends on (Redis is added in #27). */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.database.isHealthy('database'),
      () => this.ai.isHealthy('ai'),
    ]);
  }

  /**
   * Liveness: the process is up and serving, without checking dependencies, so a load balancer
   * doesn't restart the API because the AI service is down.
   */
  @Get('live')
  live() {
    return { status: 'ok' as const };
  }
}
