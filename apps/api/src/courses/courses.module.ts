import { Module } from '@nestjs/common';
import { AdminCoursesController } from './admin-courses.controller.js';
import { CoursesController, LessonsController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  controllers: [CoursesController, LessonsController, AdminCoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
