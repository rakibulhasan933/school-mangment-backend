import { Module } from '@nestjs/common';
import {
  AttendanceController,
  PublicAttendanceController,
} from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
@Module({
  controllers: [AttendanceController, PublicAttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
