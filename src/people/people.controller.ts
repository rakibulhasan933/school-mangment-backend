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
import { PeopleService } from './people.service.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';
import { ContentMutationDto } from '../content/dto/content-mutation.dto.js';

@Controller('people')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('ADMIN')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}
  @Get(':resource') list(
    @Param('resource')
    resource: 'students' | 'teachers' | 'staff' | 'subjectAssignments',
    @Req() req: AuthenticatedRequest,
    @Query('search') search?: string,
  ) {
    return this.people.list(resource, req.user.schoolId, search);
  }
  @Post(':resource') create(
    @Param('resource')
    resource: 'students' | 'teachers' | 'staff' | 'subjectAssignments',
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.people.create(resource, req.user, dto.value);
  }
  @Patch(':resource/:id') update(
    @Param('resource')
    resource: 'students' | 'teachers' | 'staff' | 'subjectAssignments',
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.people.update(resource, req.user, id, dto.value);
  }
  @Delete(':resource/:id') remove(
    @Param('resource')
    resource: 'students' | 'teachers' | 'staff' | 'subjectAssignments',
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.people.remove(resource, req.user, id);
  }
  @Post('students/import') import(
    @Req() req: AuthenticatedRequest,
    @Body() body: { rows?: Array<Record<string, unknown>>; csv?: string },
  ) {
    const rows = body.rows ?? (body.csv ? this.people.parseCsv(body.csv) : []);
    return this.people.importRows(req.user, rows);
  }
  @Post('students/promote') promote(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      studentIds: string[];
      sessionId: string;
      classId: string;
      sectionId?: string;
    },
  ) {
    return this.people.promote(req.user, body);
  }
}
