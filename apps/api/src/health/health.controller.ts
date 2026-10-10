import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/auth.decorators.js';
import { DatabaseHealthIndicator } from './database.health.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    // Redis is added in #27 and the AI service in #26.
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}
