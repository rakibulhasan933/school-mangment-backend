import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FinanceService } from './finance.service.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('ADMIN')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}
  @Get('fee-events') events(@Req() req: AuthenticatedRequest) {
    return this.finance.events(req.user.schoolId);
  }
  @Post('fee-events') createEvent(
    @Req() req: AuthenticatedRequest,
    @Body() body: Parameters<FinanceService['createEvent']>[1],
  ) {
    return this.finance.createEvent(req.user, body);
  }
  @Patch('fee-events/:id/publish') publish(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.finance.publishEvent(req.user, id);
  }
  @Get('dues') dues(
    @Req() req: AuthenticatedRequest,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('status') status?: string,
  ) {
    return this.finance.dues(req.user.schoolId, { classId, sectionId, status });
  }
  @Patch('fee-events/:id') editEvent(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: Parameters<FinanceService['updateEvent']>[2],
  ) {
    return this.finance.updateEvent(req.user, id, body);
  }
  @Post('fee-events/:id/copy') copyEvent(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { dueDate?: string },
  ) {
    return this.finance.copyEvent(req.user, id, body.dueDate);
  }
  @Delete('fee-events/:id') removeEvent(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.finance.removeEvent(req.user, id);
  }
  @Delete('payments/:id') removePayment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.finance.removePayment(req.user, id);
  }
  @Delete('salary/:id') removeSalary(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.finance.removeSalary(req.user, id);
  }
  @Delete('ledger/:id') removeLedgerEntry(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.finance.removeLedgerEntry(req.user, id);
  }
  @Post('dues/:id/pay') pay(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { amount: number; method: string; paidAt: string },
  ) {
    return this.finance.pay(req.user, id, body);
  }
  @Get('salary') salary(@Req() req: AuthenticatedRequest) {
    return this.finance.salaries(req.user.schoolId);
  }
  @Post('salary/pay') paySalary(
    @Req() req: AuthenticatedRequest,
    @Body() body: Parameters<FinanceService['paySalary']>[1],
  ) {
    return this.finance.paySalary(req.user, body);
  }
  @Get('ledger') ledger(
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.finance.ledger(req.user.schoolId, from, to);
  }
  @Get('students/:studentId/statement') statement(
    @Req() req: AuthenticatedRequest,
    @Param('studentId') studentId: string,
  ) {
    return this.finance.studentStatement(req.user, studentId);
  }
}

@Controller('public/receipts')
export class PublicReceiptController {
  constructor(private readonly finance: FinanceService) {}
  @Get('verify') verify(
    @Query('receiptNumber') receiptNumber: string,
    @Query('verifyCode') verifyCode: string,
  ) {
    return this.finance.verify(receiptNumber, verifyCode);
  }
}

@Controller('student/finance')
@UseGuards(JwtAuthGuard, TenantGuard)
export class StudentFinanceController {
  constructor(private readonly finance: FinanceService) {}
  @Get('dues') dues(@Req() req: AuthenticatedRequest) {
    return this.finance.studentDues(req.user);
  }
  @Get('payments') payments(@Req() req: AuthenticatedRequest) {
    return this.finance.studentPayments(req.user);
  }
}

@Controller('teacher/finance')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('TEACHER')
export class TeacherFinanceController {
  constructor(private readonly finance: FinanceService) {}
  @Get('salary') salary(@Req() req: AuthenticatedRequest) {
    return this.finance.teacherSalaries(req.user);
  }
}
