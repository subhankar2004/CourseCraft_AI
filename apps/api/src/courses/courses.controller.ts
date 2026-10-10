import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  type CourseDetail,
  type CourseList,
  type CourseListQuery,
  courseListQuerySchema,
  type LessonDetail,
} from '@coursecraft/shared';
import { CurrentUser, Public } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CoursesService } from './courses.service.js';

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Public()
  @Get()
  list(
    @Query(new ZodValidationPipe(courseListQuerySchema)) query: CourseListQuery,
  ): Promise<CourseList> {
    return this.courses.list(query);
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string): Promise<CourseDetail> {
    return this.courses.getBySlug(slug);
  }
}

/** Lesson bodies (notes) require a signed-in user. */
@Controller('lessons')
export class LessonsController {
  constructor(private readonly courses: CoursesService) {}

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<LessonDetail> {
    return this.courses.getLesson(id, user.role);
  }
}
