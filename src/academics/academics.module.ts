import { Module } from '@nestjs/common';
import { AcademicsController } from './academics.controller.js';
import { AcademicsService } from './academics.service.js';
import {
  PublicRoutineController,
  RoutineController,
} from './routine.controller.js';
@Module({
  controllers: [AcademicsController, RoutineController, PublicRoutineController],
  providers: [AcademicsService],
})
export class AcademicsModule {}
