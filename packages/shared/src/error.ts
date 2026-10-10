import { z } from 'zod';

/**
 * The single error body returned by every CourseCraft service:
 * the NestJS API (AllExceptionsFilter) and the AI service (app/core/errors.py).
 */
export const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.union([z.string(), z.array(z.string())]),
  path: z.string(),
  timestamp: z.iso.datetime({ offset: true }),
  requestId: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
