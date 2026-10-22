import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}
  @Get('roster') @Roles('ADMIN', 'TEACHER') roster(
    @Req() req: AuthenticatedRequest,
    @Query('classId') classId: string,
    @Query('sectionId') sectionId?: string,
  ) {
    return this.attendance.roster(req.user.schoolId, classId, sectionId);
  }
  @Post('bulk') @Roles('ADMIN', 'TEACHER') save(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      sessionId: string;
      classId: string;
      sectionId?: string;
      date: string;
      entries: Array<{ studentId: string; status: string; note?: string }>;
    },
  ) {
    return this.attendance.save(req.user, body);
  }
  @Get('report') @Roles('ADMIN') report(
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.report(req.user.schoolId, from, to);
  }
}
@Controller('public/attendance')
export class PublicAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}
  @Get() list(
    @Query('schoolId') schoolId: string,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
  ) {
    return this.attendance.public(
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
      classId,
      sectionId,
    );
  }
}
