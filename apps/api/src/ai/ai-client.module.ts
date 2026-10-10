import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { AiClient } from './ai-client.service.js';

/** The internal AI service client (one instance; `fetch` keeps connections alive). */
@Global()
@Module({
  providers: [
    {
      provide: AiClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new AiClient({
          baseUrl: config.get('AI_SERVICE_URL', { infer: true }),
          internalKey: config.get('INTERNAL_API_KEY', { infer: true }),
        }),
    },
  ],
  exports: [AiClient],
})
export class AiClientModule {}
