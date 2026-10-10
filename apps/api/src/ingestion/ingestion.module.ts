import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { INGESTION_QUEUE } from './ingestion.constants.js';
import { IngestionEvents } from './ingestion.events.js';
import { IngestionPipeline } from './ingestion.pipeline.js';
import { IngestionProcessor } from './ingestion.processor.js';
import { IngestionService } from './ingestion.service.js';

/** Course generation: queue, pipeline and progress events (SPEC §7.1). */
@Module({
  imports: [BullModule.registerQueue({ name: INGESTION_QUEUE })],
  providers: [IngestionService, IngestionPipeline, IngestionEvents],
  exports: [IngestionService, IngestionPipeline, IngestionEvents],
})
export class IngestionModule {}

/** The worker, loaded only where INGESTION_WORKER is not "false" (see AppModule). */
@Module({
  imports: [IngestionModule],
  providers: [IngestionProcessor],
})
export class IngestionWorkerModule {}
