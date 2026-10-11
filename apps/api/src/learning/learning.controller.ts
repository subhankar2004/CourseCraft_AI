import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import {
  type Enrollment,
  type LessonProgress,
  type MyCourse,
  type MyCourseProgress,
  type NextLesson,
  type UpdateProgressInput,
  updateProgressSchema,
} from '@coursecraft/shared';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { LearningService } from './learning.service.js';

/** The signed-in learner's enrollment and progress (SPEC §7.3). Any role. */
@Controller()
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Post('courses/:id/enroll')
  @HttpCode(HttpStatus.OK)
  enroll(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<Enrollment> {
    return this.learning.enroll(user.id, id);
  }

  @Get('courses/:id/progress')
  progress(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<MyCourseProgress> {
    return this.learning.courseProgress(user.id, id);
  }

  @Get('courses/:id/next')
  next(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<NextLesson> {
    return this.learning.next(user.id, id);
  }

  @Put('lessons/:id/progress')
  updateProgress(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProgressSchema)) body: UpdateProgressInput,
    @CurrentUser() user: AuthUser,
  ): Promise<LessonProgress> {
    return this.learning.updateProgress(user.id, id, body);
  }

  @Get('me/courses')
  myCourses(@CurrentUser() user: AuthUser): Promise<MyCourse[]> {
    return this.learning.myCourses(user.id);
  }
}
