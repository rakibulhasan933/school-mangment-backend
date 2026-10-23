import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AcademicsService } from './academics.service.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';
import { ContentMutationDto } from '../content/dto/content-mutation.dto.js';
@Controller('academics')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('ADMIN')
export class AcademicsController {
  constructor(private readonly academics: AcademicsService) {}
  @Get(':resource') list(
    @Param('resource')
    resource: 'sessions' | 'classes' | 'sections' | 'subjects',
    @Req() req: AuthenticatedRequest,
  ) {
    return this.academics.list(resource, req.user.schoolId);
  }
  @Post(':resource') create(
    @Param('resource')
    resource: 'sessions' | 'classes' | 'sections' | 'subjects',
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.academics.create(resource, req.user, dto.value);
  }
  @Patch(':resource/:id') update(
    @Param('resource')
    resource: 'sessions' | 'classes' | 'sections' | 'subjects',
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.academics.update(resource, req.user, id, dto.value);
  }
  @Delete(':resource/:id') remove(
    @Param('resource')
    resource: 'sessions' | 'classes' | 'sections' | 'subjects',
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.academics.remove(resource, req.user, id);
  }
}
