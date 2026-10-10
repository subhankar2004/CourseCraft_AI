import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { GenerationController, JobsController } from './generation.controller.js';
import { INGESTION_QUEUE } from './ingestion.constants.js';
import { IngestionEvents } from './ingestion.events.js';
import { IngestionPipeline } from './ingestion.pipeline.js';
import { IngestionProcessor } from './ingestion.processor.js';
import { IngestionService } from './ingestion.service.js';
import { JobEventsHub } from './job-events.hub.js';
import { JobsService } from './jobs.service.js';

/** Course generation: queue, pipeline and progress events (SPEC §7.1). */
@Module({
  imports: [BullModule.registerQueue({ name: INGESTION_QUEUE })],
  controllers: [GenerationController, JobsController],
  providers: [IngestionService, IngestionPipeline, IngestionEvents, JobsService, JobEventsHub],
  exports: [IngestionService, IngestionPipeline, IngestionEvents],
})
export class IngestionModule {}

/** The worker, loaded only where INGESTION_WORKER is not "false" (see AppModule). */
@Module({
  imports: [IngestionModule],
  providers: [IngestionProcessor],
})
export class IngestionWorkerModule {}
