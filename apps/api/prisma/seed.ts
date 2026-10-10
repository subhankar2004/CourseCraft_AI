/**
 * Idempotent demo seed: users, domains, and one fully populated course.
 *   pnpm --filter api prisma:seed     (runs via prisma.config.ts → migrations.seed)
 *
 * Re-running is safe: every record is upserted on a unique key. Existing users keep their
 * current password (it is only set when the account is created).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/auth/password.js';
import { PrismaClient, Role, TranscriptSource } from '../src/generated/prisma/client.js';
import { course, domains, modules, videos } from './seed-data/catalog.js';

const rootEnv = resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `must be at least ${MIN_PASSWORD_LENGTH} characters`);
const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  SEED_ALLOW_PRODUCTION: z.stringbool().default(false),
  DATABASE_URL: z.url(),
  SEED_ADMIN_EMAIL: z.email(),
  SEED_ADMIN_PASSWORD: password,
  SEED_STUDENT_EMAIL: z.email(),
  SEED_STUDENT_PASSWORD: password,
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Seed configuration is invalid:\n${problems}\nSee .env.example (SEED_*).`);
  }
  const env = result.data;
  if (env.NODE_ENV === 'production' && !env.SEED_ALLOW_PRODUCTION) {
    throw new Error(
      'Refusing to seed demo accounts in production (set SEED_ALLOW_PRODUCTION=true).',
    );
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });

  try {
    // Hash outside the transaction: Argon2id is deliberately slow.
    const accounts = [
      {
        email: env.SEED_ADMIN_EMAIL,
        name: 'Admin',
        role: Role.ADMIN,
        plain: env.SEED_ADMIN_PASSWORD,
      },
      {
        email: env.SEED_STUDENT_EMAIL,
        name: 'Demo Student',
        role: Role.STUDENT,
        plain: env.SEED_STUDENT_PASSWORD,
      },
    ];
    const hashes = await Promise.all(accounts.map((a) => hashPassword(a.plain)));

    await prisma.$transaction(async (tx) => {
      const users = [];
      for (const [i, account] of accounts.entries()) {
        users.push(
          await tx.user.upsert({
            where: { email: account.email },
            update: { name: account.name, role: account.role },
            create: {
              email: account.email,
              name: account.name,
              role: account.role,
              passwordHash: hashes[i]!,
            },
          }),
        );
      }
      const admin = users[0]!;

      const domainIds = new Map<string, string>();
      for (const domain of domains) {
        const row = await tx.domain.upsert({
          where: { slug: domain.slug },
          update: { name: domain.name, description: domain.description },
          create: domain,
        });
        domainIds.set(domain.slug, row.id);
      }

      const videoIds = new Map<string, string>();
      for (const video of videos) {
        const row = await tx.video.upsert({
          where: { youtubeId: video.youtubeId },
          update: video,
          // Seed videos have no transcript yet; the ingestion pipeline (#18) fills real ones.
          create: { ...video, transcriptSource: TranscriptSource.YT_MANUAL, transcript: [] },
        });
        videoIds.set(video.youtubeId, row.id);
      }

      const courseData = {
        title: course.title,
        description: course.description,
        level: course.level,
        status: 'PUBLISHED' as const,
        thumbnailUrl: course.thumbnailUrl,
        domainId: domainIds.get(course.domainSlug)!,
        llmModel: 'seed', // handwritten notes, not AI output
        embeddingModel: 'none',
      };
      const courseRow = await tx.course.upsert({
        where: { slug: course.slug },
        update: courseData,
        create: { slug: course.slug, createdById: admin.id, ...courseData },
      });

      for (const [moduleIndex, module] of modules.entries()) {
        const moduleOrder = moduleIndex + 1;
        const moduleRow = await tx.module.upsert({
          where: { courseId_order: { courseId: courseRow.id, order: moduleOrder } },
          update: { title: module.title, summary: module.summary },
          create: {
            courseId: courseRow.id,
            order: moduleOrder,
            title: module.title,
            summary: module.summary,
          },
        });

        for (const [lessonIndex, lesson] of module.lessons.entries()) {
          const lessonOrder = lessonIndex + 1;
          const { youtubeId, ...lessonFields } = lesson;
          const data = { ...lessonFields, videoId: videoIds.get(youtubeId)! };
          await tx.lesson.upsert({
            where: { moduleId_order: { moduleId: moduleRow.id, order: lessonOrder } },
            update: data,
            create: { moduleId: moduleRow.id, order: lessonOrder, ...data },
          });
        }
      }
    });

    const counts = {
      users: await prisma.user.count(),
      domains: await prisma.domain.count(),
      courses: await prisma.course.count(),
      modules: await prisma.module.count(),
      lessons: await prisma.lesson.count(),
      videos: await prisma.video.count(),
    };
    // Never print credentials; they live only in .env.
    console.log('Seed complete:', JSON.stringify(counts));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
