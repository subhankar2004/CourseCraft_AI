import { z } from 'zod';

const DURATION_UNITS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** "15m", "12h", "7d" → seconds. Used for both the JWT `exp` and the cookie max-age. */
const durationSeconds = z
  .string()
  .regex(/^\d+[smhd]$/, 'use a number followed by s, m, h or d (e.g. 7d)')
  .transform((value) => {
    const unit = value.at(-1) as keyof typeof DURATION_UNITS;
    return Number(value.slice(0, -1)) * DURATION_UNITS[unit];
  })
  .pipe(z.number().int().positive());

/** Express "trust proxy": false (default), true, or the number of proxy hops in front of the API. */
const trustProxy = z
  .string()
  .default('false')
  .transform((value, ctx) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    const hops = Number(value);
    if (Number.isInteger(hops) && hops >= 0) return hops;
    ctx.addIssue({ code: 'custom', message: 'use true, false or a number of proxy hops' });
    return z.NEVER;
  });

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
  JWT_EXPIRES_IN: durationSeconds.default(7 * DURATION_UNITS.d),
  // Only enable behind a reverse proxy you control; otherwise clients could spoof their IP.
  TRUST_PROXY: trustProxy,
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
