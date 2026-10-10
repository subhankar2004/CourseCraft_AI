import { Module } from '@nestjs/common';
import { CoursesController, LessonsController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  controllers: [CoursesController, LessonsController],
  providers: [CoursesService],
})
export class CoursesModule {}
