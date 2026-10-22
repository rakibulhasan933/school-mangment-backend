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
import { AdmissionService } from './admission.service.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';
@Controller('admissions')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('ADMIN')
export class AdmissionController {
  constructor(private readonly admission: AdmissionService) {}
  @Get('settings') settings(@Req() req: AuthenticatedRequest) {
    return this.admission.settings(req.user.schoolId);
  }
  @Patch('settings') saveSettings(
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admission.saveSettings(req.user, body);
  }
  @Get() list(@Req() req: AuthenticatedRequest) {
    return this.admission.list(req.user.schoolId);
  }
  @Patch(':id/review') review(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; note?: string },
  ) {
    return this.admission.review(req.user, id, body.status, body.note);
  }
}
@Controller('public/admissions')
export class PublicAdmissionController {
  constructor(private readonly admission: AdmissionService) {}
  @Get('settings') settings(@Query('schoolId') schoolId: string) {
    return this.admission.settings(
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
    );
  }
  @Post() submit(
    @Query('schoolId') schoolId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admission.submit(
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
      body,
    );
  }
  @Get('status/:trackingId') status(
    @Param('trackingId') id: string,
    @Query('schoolId') schoolId: string,
  ) {
    return this.admission.status(
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
      id,
    );
  }
}
