import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';
import { SchoolsService } from './schools.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';

@Controller('schools/settings')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}
  @Get() @Roles('ADMIN', 'TEACHER', 'STUDENT') get(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.schools.getSettings(request.user);
  }
  @Patch() @Roles('ADMIN') update(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.schools.updateSettings(request.user, dto);
  }
}
