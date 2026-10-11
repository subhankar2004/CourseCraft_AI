import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CompletedLesson,
  Enrollment,
  LessonProgress,
  MyCourse,
  MyCourseProgress,
  NextLesson,
  UpdateProgressInput,
} from '@coursecraft/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { nextProgress, summarize } from './progress-rules.js';

interface OrderedLesson {
  id: string;
  title: string;
  moduleTitle: string;
}

/**
 * Enrollment, lesson progress and the next-lesson rule (SPEC §7.3). Only PUBLISHED courses can
 * be studied: drafts are 404, as for lessons and courses elsewhere.
 */
@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent. */
  async enroll(userId: string, courseId: string): Promise<Enrollment> {
    await this.publishedCourse(courseId);
    const enrollment = await this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: {},
    });
    return { courseId, enrolledAt: enrollment.enrolledAt.toISOString() };
  }

  /**
   * Records progress on a lesson. Studying a lesson enrolls the user in its course (opening a
   * lesson means taking the course).
   */
  async updateProgress(
    userId: string,
    lessonId: string,
    input: UpdateProgressInput,
  ): Promise<LessonProgress> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        video: { select: { durationSec: true } },
        module: { select: { course: { select: { id: true, status: true } } } },
      },
    });
    if (!lesson || lesson.module.course.status !== 'PUBLISHED') {
      throw new NotFoundException('Lesson not found');
    }
    const courseId = lesson.module.course.id;
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: { userId, courseId },
        update: {},
      });
      const current = await tx.lessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId } },
      });
      const next = nextProgress(current, input, lesson.video.durationSec, new Date());
      return tx.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId, ...next },
        update: next,
      });
    });
    const progress = await this.courseProgress(userId, courseId);
    return {
      lessonId,
      status: saved.status,
      lastPositionSec: saved.lastPositionSec,
      completedAt: saved.completedAt?.toISOString() ?? null,
      course: { courseId, ...progress.progress },
    };
  }

  async next(userId: string, courseId: string): Promise<NextLesson> {
    const { next, progress } = await this.courseProgress(userId, courseId);
    return {
      lesson: next,
      courseCompleted: progress.total > 0 && progress.completed === progress.total,
    };
  }

  async courseProgress(userId: string, courseId: string): Promise<MyCourseProgress> {
    await this.publishedCourse(courseId);
    const [lessons, enrollment] = await Promise.all([
      this.orderedLessons([courseId]),
      this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } }),
    ]);
    const ordered = lessons.get(courseId) ?? [];
    const rows = await this.prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: ordered.map((l) => l.id) } },
      select: { lessonId: true, status: true, lastPositionSec: true },
    });
    const byLesson = new Map(rows.map((r) => [r.lessonId, r]));
    const completed = ordered.filter((l) => byLesson.get(l.id)?.status === 'COMPLETED');
    return {
      courseId,
      enrolled: enrollment !== null,
      enrolledAt: enrollment?.enrolledAt.toISOString() ?? null,
      progress: summarize(completed.length, ordered.length),
      lessons: ordered.map((l) => ({
        lessonId: l.id,
        status: byLesson.get(l.id)?.status ?? 'NOT_STARTED',
        lastPositionSec: byLesson.get(l.id)?.lastPositionSec ?? 0,
      })),
      next: ordered.find((l) => byLesson.get(l.id)?.status !== 'COMPLETED') ?? null,
    };
  }

  /** Enrolled, published courses, most recently studied (or enrolled) first. */
  async myCourses(userId: string): Promise<MyCourse[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, course: { status: 'PUBLISHED' } },
      select: {
        enrolledAt: true,
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            level: true,
            thumbnailUrl: true,
            domain: { select: { slug: true, name: true } },
          },
        },
      },
    });
    if (enrollments.length === 0) return [];
    const lessons = await this.orderedLessons(enrollments.map((e) => e.course.id));
    const allLessonIds = [...lessons.values()].flat().map((l) => l.id);
    const rows = await this.prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: allLessonIds } },
      select: { lessonId: true, status: true, lastPositionSec: true, updatedAt: true },
    });
    const byLesson = new Map(rows.map((r) => [r.lessonId, r]));

    const courses = enrollments.map(({ course, enrolledAt }) => {
      const ordered = lessons.get(course.id) ?? [];
      const completed = ordered.filter((l) => byLesson.get(l.id)?.status === 'COMPLETED').length;
      const studied = ordered
        .filter((l) => byLesson.has(l.id))
        .sort(
          (a, b) =>
            byLesson.get(b.id)!.updatedAt.getTime() - byLesson.get(a.id)!.updatedAt.getTime(),
        );
      const last = studied[0];
      const lastRow = last ? byLesson.get(last.id)! : undefined;
      return {
        activity: lastRow?.updatedAt ?? enrolledAt,
        course: {
          course,
          enrolledAt: enrolledAt.toISOString(),
          progress: summarize(completed, ordered.length),
          lastLesson:
            last && lastRow
              ? {
                  ...last,
                  status: lastRow.status,
                  lastPositionSec: lastRow.lastPositionSec,
                  studiedAt: lastRow.updatedAt.toISOString(),
                }
              : null,
          next: ordered.find((l) => byLesson.get(l.id)?.status !== 'COMPLETED') ?? null,
        } satisfies MyCourse,
      };
    });
    return courses.sort((a, b) => b.activity.getTime() - a.activity.getTime()).map((c) => c.course);
  }

  /** Lessons the user completed, most recent first, in published courses only. */
  async completedLessons(userId: string, limit: number): Promise<CompletedLesson[]> {
    const rows = await this.prisma.lessonProgress.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        completedAt: { not: null },
        lesson: { module: { course: { status: 'PUBLISHED' } } },
      },
      orderBy: [{ completedAt: 'desc' }, { lessonId: 'asc' }],
      take: limit,
      select: {
        completedAt: true,
        lesson: {
          select: {
            id: true,
            title: true,
            module: {
              select: { title: true, course: { select: { id: true, slug: true, title: true } } },
            },
          },
        },
      },
    });
    return rows.map(({ completedAt, lesson }) => ({
      lessonId: lesson.id,
      title: lesson.title,
      moduleTitle: lesson.module.title,
      course: lesson.module.course,
      completedAt: completedAt!.toISOString(),
    }));
  }

  /** Lessons of each course in course order (module order, then lesson order). */
  private async orderedLessons(courseIds: string[]): Promise<Map<string, OrderedLesson[]>> {
    const rows = await this.prisma.lesson.findMany({
      where: { module: { courseId: { in: courseIds } } },
      orderBy: [{ module: { order: 'asc' } }, { order: 'asc' }],
      select: { id: true, title: true, module: { select: { title: true, courseId: true } } },
    });
    const byCourse = new Map<string, OrderedLesson[]>();
    for (const row of rows) {
      const list = byCourse.get(row.module.courseId) ?? [];
      list.push({ id: row.id, title: row.title, moduleTitle: row.module.title });
      byCourse.set(row.module.courseId, list);
    }
    return byCourse;
  }

  private async publishedCourse(courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }
}
