import { z } from 'zod';

/**
 * Environment contract for the API. Validated once at boot; the process exits
 * with a readable error if anything is missing or malformed (fail fast).
 * Keep in sync with the root .env.example and SPEC §12.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Comma-separated list of browser origins allowed by CORS.
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.url())),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters (openssl rand -base64 48)'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  AI_SERVICE_URL: z.url().default('http://localhost:8000'),
  INTERNAL_API_KEY: z
    .string()
    .min(32, 'INTERNAL_API_KEY must be at least 32 characters (openssl rand -hex 32)'),
  MAX_VIDEOS_PER_COURSE: z.coerce.number().int().positive().default(25),
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule.forRoot({ validate }). */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  return result.data;
}
