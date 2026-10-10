import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { AiClient } from '../ai/ai-client.service.js';
import { AiServiceError } from '../ai/ai-client.errors.js';

/**
 * Checks the AI service: reachable, and its LLM and vector store configured. /health is public,
 * so only a short status is returned; details are logged server-side.
 */
@Injectable()
export class AiHealthIndicator {
  private readonly logger = new Logger(AiHealthIndicator.name);

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly ai: AiClient,
  ) {}

  async isHealthy<const Key extends string>(key: Key) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const health = await this.ai.health();
      const { llm, vectorStore } = health.providers;
      if (!llm.configured || !vectorStore.configured) {
        this.logger.warn(
          `AI service not configured: llm=${llm.provider}/${llm.configured} vectorStore=${vectorStore.provider}/${vectorStore.configured}`,
        );
        return indicator.down({ message: 'AI service not configured' });
      }
      return indicator.up({ llm: llm.provider, vectorStore: vectorStore.provider });
    } catch (error) {
      const reason =
        error instanceof AiServiceError ? `${error.kind}: ${error.message}` : String(error);
      this.logger.warn(`AI service health check failed: ${reason}`);
      return indicator.down({ message: 'AI service unreachable' });
    }
  }
}
