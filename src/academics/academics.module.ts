import { Module } from '@nestjs/common';
import { AcademicsController } from './academics.controller.js';
import { AcademicsService } from './academics.service.js';
import { RoutineController } from './routine.controller.js';
@Module({
  controllers: [AcademicsController, RoutineController],
  providers: [AcademicsService],
})
export class AcademicsModule {}
