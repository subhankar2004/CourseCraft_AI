import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CourseDetail,
  CourseList,
  CourseListQuery,
  LessonDetail,
  Role,
} from '@coursecraft/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { courseSummarySelect, PUBLISHED, toCourseSummary } from './course-summary.js';

const domainRef = { select: { slug: true, name: true } } as const;

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Published courses, filtered and paginated. Search is a case-insensitive match on title/description. */
  async list(query: CourseListQuery): Promise<CourseList> {
    const where: Prisma.CourseWhereInput = {
      ...PUBLISHED,
      ...(query.domain && { domain: { slug: query.domain } }),
      ...(query.level && { level: query.level }),
      ...(query.q && {
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        select: { ...courseSummarySelect, domain: domainRef },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map(({ domain, ...row }) => ({ ...toCourseSummary(row), domain })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  /** The course outline (modules and lesson titles in order), without lesson bodies. */
  async getBySlug(slug: string): Promise<CourseDetail> {
    const course = await this.prisma.course.findFirst({
      where: { slug, ...PUBLISHED },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        level: true,
        thumbnailUrl: true,
        updatedAt: true,
        domain: domainRef,
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
                readingTimeMin: true,
                video: { select: { id: true, durationSec: true } },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException(`Course "${slug}" not found`);

    const videoLengths = new Map<string, number>();
    const modules = course.modules.map(({ lessons, ...module }) => ({
      ...module,
      lessons: lessons.map(({ video, ...lesson }) => {
        videoLengths.set(video.id, video.durationSec);
        return { ...lesson, videoDurationSec: video.durationSec };
      }),
    }));
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      level: course.level,
      thumbnailUrl: course.thumbnailUrl,
      domain: course.domain,
      lessonCount: modules.reduce((sum, m) => sum + m.lessons.length, 0),
      totalVideoSec: [...videoLengths.values()].reduce((a, b) => a + b, 0),
      modules,
      updatedAt: course.updatedAt.toISOString(),
    };
  }

  /**
   * A lesson with notes, video and neighbours. Lessons of unpublished courses are visible to
   * admins only (preview during review, #31); others get 404 so drafts aren't revealed.
   */
  async getLesson(id: string, viewerRole: Role): Promise<LessonDetail> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        order: true,
        summary: true,
        notesMarkdown: true,
        keyConcepts: true,
        readingTimeMin: true,
        module: {
          select: {
            id: true,
            title: true,
            order: true,
            course: { select: { id: true, slug: true, title: true, status: true } },
          },
        },
        video: {
          select: {
            youtubeId: true,
            title: true,
            channel: true,
            durationSec: true,
            thumbnailUrl: true,
          },
        },
      },
    });
    const visible =
      lesson && (lesson.module.course.status === 'PUBLISHED' || viewerRole === 'ADMIN');
    if (!lesson || !visible) throw new NotFoundException('Lesson not found');

    // Course order across module boundaries: (module.order, lesson.order).
    const ordered = await this.prisma.lesson.findMany({
      where: { module: { courseId: lesson.module.course.id } },
      orderBy: [{ module: { order: 'asc' } }, { order: 'asc' }],
      select: { id: true },
    });
    const index = ordered.findIndex((l) => l.id === id);

    const { module, ...rest } = lesson;
    const { course, ...moduleRef } = module;
    return {
      ...rest,
      module: moduleRef,
      course: { id: course.id, slug: course.slug, title: course.title },
      prevLessonId: ordered[index - 1]?.id ?? null,
      nextLessonId: ordered[index + 1]?.id ?? null,
    };
  }
}
