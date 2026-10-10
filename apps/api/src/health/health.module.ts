import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AiHealthIndicator } from './ai.health.js';
import { DatabaseHealthIndicator } from './database.health.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, AiHealthIndicator],
})
export class HealthModule {}
