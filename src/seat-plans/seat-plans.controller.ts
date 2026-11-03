import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SeatPlansService } from './seat-plans.service.js';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class SeatPlansController {
  constructor(private readonly service: SeatPlansService) {}
  @Get('rooms') @Roles('ADMIN') rooms(@Req() r: AuthenticatedRequest) { return this.service.rooms(r.user.schoolId); }
  @Post('rooms') @Roles('ADMIN') createRoom(@Req() r: AuthenticatedRequest, @Body() b: Parameters<SeatPlansService['createRoom']>[1]) { return this.service.createRoom(r.user, b); }
  @Patch('rooms/:id') @Roles('ADMIN') updateRoom(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() b: Parameters<SeatPlansService['updateRoom']>[2]) { return this.service.updateRoom(r.user, id, b); }
  @Delete('rooms/:id') @Roles('ADMIN') deleteRoom(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.service.deleteRoom(r.user, id); }
  @Get('seat-plans') @Roles('ADMIN') list(@Req() r: AuthenticatedRequest, @Query('examId') examId?: string, @Query('sittingDate') date?: string) { return this.service.list(r.user.schoolId, { examId, sittingDate: date }); }
  @Post('seat-plans') @Roles('ADMIN') create(@Req() r: AuthenticatedRequest, @Body() b: Parameters<SeatPlansService['create']>[1]) { return this.service.create(r.user, b); }
  @Get('seat-plans/:id') @Roles('ADMIN') detail(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.service.detail(r.user.schoolId, id); }
  @Get('seat-plans/:id/candidates') @Roles('ADMIN') candidates(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.service.candidates(r.user.schoolId, id); }
  @Patch('seat-plans/:id/candidates') @Roles('ADMIN') editCandidates(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() b: Parameters<SeatPlansService['editCandidates']>[2]) { return this.service.editCandidates(r.user, id, b); }
  @Post('seat-plans/:id/candidates/add') @Roles('ADMIN') addCandidate(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() b: { registrationNumber: string }) { return this.service.addCandidate(r.user, id, b.registrationNumber); }
  @Post('seat-plans/:id/generate') @Roles('ADMIN') generate(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() b: Parameters<SeatPlansService['generate']>[2]) { return this.service.generate(r.user, id, b); }
  @Patch('seat-plans/:id/assignments') @Roles('ADMIN') editAssignments(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() b: Parameters<SeatPlansService['editAssignments']>[2]) { return this.service.editAssignments(r.user, id, b); }
  @Post('seat-plans/:id/append') @Roles('ADMIN') append(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.service.append(r.user, id); }
  @Post('seat-plans/:id/lock') @Roles('ADMIN') lock(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.service.changeStatus(r.user, id, 'locked'); }
  @Post('seat-plans/:id/publish') @Roles('ADMIN') publish(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.service.changeStatus(r.user, id, 'published'); }
  @Post('seat-plans/:id/copy') @Roles('ADMIN') copy(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() b: { targetExamSubjectIds: string[] }) { return this.service.copy(r.user, id, b.targetExamSubjectIds); }
  @Get('seat-plans/:id/excluded') @Roles('ADMIN') excluded(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.service.excluded(r.user.schoolId, id); }
  @Get('seat-plans/:id/print') @Roles('ADMIN') print(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.service.printData(r.user.schoolId, id); }
  @Post('seat-plans/:id/send-sms') @Roles('ADMIN') sms(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.service.sendSms(r.user, id); }
}

@Controller('student/seat-plans')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('STUDENT')
export class StudentSeatPlansController {
  constructor(private readonly service: SeatPlansService) {}
  @Get() mine(@Req() r: AuthenticatedRequest) { return this.service.studentPlans(r.user); }
}
