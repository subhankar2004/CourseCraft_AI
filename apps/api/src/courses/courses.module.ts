import { Module } from '@nestjs/common';
import { AdminCoursesController } from './admin-courses.controller.js';
import { CourseReviewController } from './course-review.controller.js';
import { CourseReviewService } from './course-review.service.js';
import { CoursesController, LessonsController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  controllers: [
    CoursesController,
    LessonsController,
    AdminCoursesController,
    CourseReviewController,
  ],
  providers: [CoursesService, CourseReviewService],
})
export class CoursesModule {}
