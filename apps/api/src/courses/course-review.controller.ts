import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  type AdminCourseDetail,
  type CourseOutlineUpdate,
  courseOutlineUpdateSchema,
  type UpdateCourseInput,
  updateCourseSchema,
} from '@coursecraft/shared';
import { Roles } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CourseReviewService } from './course-review.service.js';

/** Admin edits of a course (#31). Reads for review are `GET /admin/courses/:id`. */
@Controller('courses')
@Roles('ADMIN')
export class CourseReviewController {
  constructor(private readonly review: CourseReviewService) {}

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCourseSchema)) body: UpdateCourseInput,
  ): Promise<AdminCourseDetail> {
    return this.review.update(id, body);
  }

  /** Reorder modules and lessons, move lessons between modules, rename/add/remove modules. */
  @Put(':id/outline')
  outline(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(courseOutlineUpdateSchema)) body: CourseOutlineUpdate,
  ): Promise<AdminCourseDetail> {
    return this.review.updateOutline(id, body);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id') id: string): Promise<AdminCourseDetail> {
    return this.review.publish(id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('id') id: string): Promise<AdminCourseDetail> {
    return this.review.unpublish(id);
  }

  /** Deletes the course and its chatbot vectors (503, and nothing deleted, if the AI service is down). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.review.remove(id);
  }
}
