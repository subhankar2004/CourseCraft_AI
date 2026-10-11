import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  cognitiveLoadSchema,
  type AdminCourseDetail,
  type CourseOutlineUpdate,
  type UpdateCourseInput,
} from '@coursecraft/shared';
import { AiServiceError } from '../ai/ai-client.errors.js';
import { AiClient } from '../ai/ai-client.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const detailSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  status: true,
  level: true,
  thumbnailUrl: true,
  llmModel: true,
  embeddingModel: true,
  createdAt: true,
  updatedAt: true,
  domain: { select: { id: true, name: true, slug: true } },
  modules: {
    orderBy: { order: 'asc' },
    select: {
      id: true,
      title: true,
      summary: true,
      order: true,
      lessons: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          order: true,
          summary: true,
          readingTimeMin: true,
          cognitiveLoad: true,
          video: { select: { youtubeId: true, durationSec: true } },
        },
      },
    },
  },
  jobs: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, status: true, stage: true, progress: true, error: true, report: true },
  },
} satisfies Prisma.CourseSelect;

/**
 * Admin review of a generated course (#31): edit details, reorganise the outline, publish,
 * delete. A course that is still being generated can't be changed: the pipeline's final
 * transaction would overwrite the edits.
 */
@Injectable()
export class CourseReviewService {
  private readonly logger = new Logger(CourseReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
  ) {}

  async get(id: string): Promise<AdminCourseDetail> {
    const course = await this.prisma.course.findUnique({ where: { id }, select: detailSelect });
    if (!course) throw new NotFoundException('Course not found');
    const { modules, jobs, createdAt, updatedAt, ...rest } = course;
    const job = jobs[0];
    const report = (job?.report ?? null) as { outlineRepairs?: unknown } | null;
    return {
      ...rest,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      moduleCount: modules.length,
      lessonCount: modules.reduce((sum, m) => sum + m.lessons.length, 0),
      latestJob: job
        ? {
            id: job.id,
            status: job.status,
            stage: job.stage,
            progress: job.progress,
            error: job.error,
          }
        : null,
      outlineRepairs: Array.isArray(report?.outlineRepairs)
        ? report.outlineRepairs.filter((r): r is string => typeof r === 'string')
        : [],
      modules: modules.map(({ lessons, ...module }) => ({
        ...module,
        lessons: lessons.map(({ video, cognitiveLoad, ...lesson }) => ({
          ...lesson,
          youtubeId: video.youtubeId,
          videoDurationSec: video.durationSec,
          // Stored JSON, checked on the way out: anything malformed shows as "not measured".
          cognitiveLoad: cognitiveLoadSchema.safeParse(cognitiveLoad).data ?? null,
        })),
      })),
    };
  }

  async update(id: string, input: UpdateCourseInput): Promise<AdminCourseDetail> {
    await this.editable(id);
    if (input.domainId) {
      const domain = await this.prisma.domain.findUnique({ where: { id: input.domainId } });
      if (!domain) throw new BadRequestException(['domainId: unknown domain']);
    }
    try {
      await this.prisma.course.update({ where: { id }, data: input });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('slug: already used by another course');
      }
      throw error;
    }
    return this.get(id);
  }

  /**
   * Replaces the outline in one transaction. Orders are unique per parent, so they are first
   * moved out of the way (negated), then assigned their final values; no intermediate state
   * collides. Every lesson must appear exactly once, so content can never be lost.
   */
  async updateOutline(id: string, outline: CourseOutlineUpdate): Promise<AdminCourseDetail> {
    await this.editable(id);
    const modules = await this.prisma.module.findMany({
      where: { courseId: id },
      select: { id: true, lessons: { select: { id: true } } },
    });
    const moduleIds = new Set(modules.map((m) => m.id));
    const lessonIds = new Set(modules.flatMap((m) => m.lessons.map((l) => l.id)));

    const problems: string[] = [];
    const seenModules = new Set<string>();
    const seenLessons = new Set<string>();
    for (const [index, module] of outline.modules.entries()) {
      if (module.id !== undefined) {
        if (!moduleIds.has(module.id))
          problems.push(`modules.${index}.id: not a module of this course`);
        if (seenModules.has(module.id)) problems.push(`modules.${index}.id: listed twice`);
        seenModules.add(module.id);
      }
      for (const lessonId of module.lessonIds) {
        if (!lessonIds.has(lessonId))
          problems.push(`lesson ${lessonId}: not a lesson of this course`);
        else if (seenLessons.has(lessonId)) problems.push(`lesson ${lessonId}: listed twice`);
        seenLessons.add(lessonId);
      }
    }
    const missing = [...lessonIds].filter((lessonId) => !seenLessons.has(lessonId));
    if (missing.length > 0)
      problems.push(`every lesson must be placed; missing: ${missing.join(', ')}`);
    if (problems.length > 0) throw new BadRequestException(problems);

    await this.prisma.$transaction(async (tx) => {
      // Phase 1: move every current order out of the way (unique per parent, so -order-1 is too).
      await tx.$executeRaw`UPDATE "modules" SET "order" = -"order" - 1 WHERE "course_id" = ${id}`;
      await tx.$executeRaw`UPDATE "lessons" SET "order" = -"order" - 1
        WHERE "module_id" IN (SELECT "id" FROM "modules" WHERE "course_id" = ${id})`;
      // Phase 2: final orders, titles and parents.
      const kept: string[] = [];
      for (const [order, module] of outline.modules.entries()) {
        const moduleId =
          module.id === undefined
            ? (await tx.module.create({ data: { courseId: id, title: module.title, order } })).id
            : (
                await tx.module.update({
                  where: { id: module.id },
                  data: { title: module.title, order },
                })
              ).id;
        kept.push(moduleId);
        for (const [lessonOrder, lessonId] of module.lessonIds.entries()) {
          await tx.lesson.update({
            where: { id: lessonId },
            data: { moduleId, order: lessonOrder },
          });
        }
      }
      // Existing modules left out of the outline are empty now: remove them.
      await tx.module.deleteMany({
        where: { courseId: id, id: { notIn: kept }, lessons: { none: {} } },
      });
      await tx.course.update({ where: { id }, data: { updatedAt: new Date() } });
    });
    return this.get(id);
  }

  async publish(id: string): Promise<AdminCourseDetail> {
    const course = await this.editable(id);
    if (course.status === 'FAILED')
      throw new ConflictException('A failed course cannot be published');
    if (course.status === 'DRAFT') {
      const lessons = await this.prisma.lesson.count({ where: { module: { courseId: id } } });
      if (lessons === 0)
        throw new ConflictException('A course needs at least one lesson to be published');
      await this.prisma.course.update({ where: { id }, data: { status: 'PUBLISHED' } });
    }
    return this.get(id); // publishing a published course is a no-op
  }

  async unpublish(id: string): Promise<AdminCourseDetail> {
    const course = await this.editable(id);
    if (course.status === 'PUBLISHED') {
      await this.prisma.course.update({ where: { id }, data: { status: 'DRAFT' } });
    }
    return this.get(id);
  }

  /**
   * Deletes the chatbot's vectors first, then the course (modules, lessons, chunks, jobs,
   * enrollments, progress and chats cascade). If the AI service is down nothing is deleted, so a
   * course never disappears while its vectors stay behind.
   */
  async remove(id: string): Promise<{ slug: string; domainSlug: string }> {
    const course = await this.editable(id);
    try {
      await this.ai.deleteCourseVectors(id, { requestId: `course-delete-${id}` });
    } catch (error) {
      const reason =
        error instanceof AiServiceError ? `${error.kind}: ${error.message}` : String(error);
      this.logger.warn(`Course ${id} not deleted: its vectors could not be removed (${reason})`);
      throw new ServiceUnavailableException(
        'The AI service is unavailable, so the course was not deleted. Try again later.',
      );
    }
    await this.prisma.course.delete({ where: { id } });
    return { slug: course.slug, domainSlug: course.domain.slug };
  }

  /** The course, unless it is being generated (its job would overwrite any change). */
  private async editable(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true, status: true, slug: true, domain: { select: { slug: true } } },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.status === 'GENERATING') {
      throw new ConflictException(
        'The course is still being generated; wait for its job to finish',
      );
    }
    return course;
  }
}
