import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    // Dependency indicators are added as they arrive:
    // PostgreSQL in #7, Redis in #27, AI service in #26.
    return this.health.check([]);
  }
}
