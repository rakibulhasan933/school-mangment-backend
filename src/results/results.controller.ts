import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ResultsService } from './results.service.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';
import { ContentMutationDto } from '../content/dto/content-mutation.dto.js';

@Controller('results')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}
  @Get('grading-scales') @Roles('ADMIN') scales(
    @Req() req: AuthenticatedRequest,
  ) {
    return this.results.scales(req.user.schoolId);
  }
  @Post('grading-scales') @Roles('ADMIN') scale(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.results.saveScale(
      req.user,
      dto.value as {
        minMarks: number;
        maxMarks: number;
        letter: string;
        gpa: number;
      },
    );
  }
  @Get('exams') @Roles('ADMIN', 'TEACHER') exams(
    @Req() req: AuthenticatedRequest,
  ) {
    return this.results.exams(req.user.schoolId);
  }
  @Post('exams') @Roles('ADMIN') exam(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.results.createExam(req.user, dto.value);
  }
  @Patch('exams/:id/publish') @Roles('ADMIN') publish(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { publishAt?: string; countdownEnabled?: boolean },
  ) {
    return this.results.publish(req.user, id, body);
  }
  @Post('marks') @Roles('ADMIN', 'TEACHER') mark(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      examSubjectId: string;
      studentId: string;
      cq?: number;
      mcq?: number;
      practical?: number;
      isAbsent?: boolean;
    },
  ) {
    return this.results.saveMark(req.user, body);
  }
  @Patch('marks/:id/unlock') @Roles('ADMIN') unlock(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.results.unlockMark(req.user, id);
  }
  @Post('exams/:examId/process/:classId') @Roles('ADMIN') process(
    @Req() req: AuthenticatedRequest,
    @Param('examId') examId: string,
    @Param('classId') classId: string,
  ) {
    return this.results.process(req.user, examId, classId);
  }
  @Get('me') @Roles('STUDENT') student(
    @Req() req: AuthenticatedRequest,
    @Query('examId') examId?: string,
  ) {
    return this.results.student(req.user, examId);
  }
}

@Controller('public/results')
export class PublicResultsController {
  constructor(private readonly results: ResultsService) {}
  @Get() list(
    @Query('schoolId') schoolId: string,
    @Query('examId') examId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.results.publicList(
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
      examId,
      classId,
    );
  }
  @Get('search') search(
    @Query('schoolId') schoolId: string,
    @Query('registrationNumber') registrationNumber: string,
    @Query('examId') examId?: string,
  ) {
    return this.results.publicSearch(
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
      registrationNumber,
      examId,
    );
  }
}

@Controller('public/exams')
export class PublicExamsController {
  constructor(private readonly results: ResultsService) {}
  @Get() list(@Query('schoolId') schoolId?: string) {
    return this.results.publicExams(
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
    );
  }
}
