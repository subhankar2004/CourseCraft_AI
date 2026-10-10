import { z } from 'zod';

/** Per-dependency status reported by @nestjs/terminus. */
const indicatorSchema = z.record(z.string(), z.object({ status: z.string() }).loose());

/** `GET /api/v1/health` on the NestJS API (@nestjs/terminus shape). */
export const apiHealthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error', 'shutting_down']),
  info: indicatorSchema.optional(),
  error: indicatorSchema.optional(),
  details: indicatorSchema,
});

export type ApiHealth = z.infer<typeof apiHealthSchema>;

/** `GET /health` on the AI service (services/ai/app/schemas.py HealthResponse). */
export const aiHealthSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  providers: z.object({
    llm: z.object({
      provider: z.enum(['openai', 'ollama']),
      chatModel: z.string(),
      embeddingModel: z.string(),
      embeddingDimension: z.number().int().positive(),
      configured: z.boolean(),
    }),
    vectorStore: z.object({
      provider: z.enum(['pgvector', 'pinecone']),
      index: z.string(),
      configured: z.boolean(),
    }),
  }),
});

export type AiHealth = z.infer<typeof aiHealthSchema>;
