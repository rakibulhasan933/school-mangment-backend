import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  routineEntries,
  sections,
  subjects,
  teachers,
} from '../db/schema.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';
import { ContentMutationDto } from '../content/dto/content-mutation.dto.js';

@Controller('routine')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class RoutineController {
  private readonly db = createDb();
  @Get() @Roles('ADMIN') async list(@Req() request: AuthenticatedRequest) {
    return { data: await this.rows(request.user.schoolId) };
  }
  @Post() @Roles('ADMIN') async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    const value = dto.value;
    const [row] = await this.db
      .insert(routineEntries)
      .values({
        schoolId: request.user.schoolId,
        classId: String(value.classId),
        sectionId: value.sectionId ? String(value.sectionId) : undefined,
        subjectId: value.subjectId ? String(value.subjectId) : undefined,
        teacherId: value.teacherId ? String(value.teacherId) : undefined,
        dayOfWeek: Number(value.dayOfWeek),
        period: Number(value.period),
        room: value.room ? String(value.room) : undefined,
      })
      .returning();
    return { data: row };
  }
  @Patch(':id') @Roles('ADMIN') async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ContentMutationDto,
  ) {
    const value = dto.value;
    const [row] = await this.db
      .update(routineEntries)
      .set({
        ...(value.classId ? { classId: String(value.classId) } : {}),
        ...(value.sectionId !== undefined
          ? { sectionId: value.sectionId ? String(value.sectionId) : null }
          : {}),
        ...(value.subjectId !== undefined
          ? { subjectId: value.subjectId ? String(value.subjectId) : null }
          : {}),
        ...(value.teacherId !== undefined
          ? { teacherId: value.teacherId ? String(value.teacherId) : null }
          : {}),
        ...(value.dayOfWeek !== undefined
          ? { dayOfWeek: Number(value.dayOfWeek) }
          : {}),
        ...(value.period !== undefined ? { period: Number(value.period) } : {}),
        ...(value.room !== undefined
          ? { room: value.room ? String(value.room) : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(routineEntries.id, id),
          eq(routineEntries.schoolId, request.user.schoolId),
        ),
      )
      .returning();
    return { data: row };
  }
  private async rows(schoolId: string) {
    return this.db
      .select({
        id: routineEntries.id,
        dayOfWeek: routineEntries.dayOfWeek,
        period: routineEntries.period,
        room: routineEntries.room,
        classId: routineEntries.classId,
        classNameBn: academicClasses.nameBn,
        sectionId: routineEntries.sectionId,
        sectionNameBn: sections.nameBn,
        subjectId: routineEntries.subjectId,
        subjectNameBn: subjects.nameBn,
        teacherId: routineEntries.teacherId,
        teacherCode: teachers.teacherCode,
      })
      .from(routineEntries)
      .innerJoin(
        academicClasses,
        eq(academicClasses.id, routineEntries.classId),
      )
      .leftJoin(sections, eq(sections.id, routineEntries.sectionId))
      .leftJoin(subjects, eq(subjects.id, routineEntries.subjectId))
      .leftJoin(teachers, eq(teachers.id, routineEntries.teacherId))
      .where(eq(routineEntries.schoolId, schoolId))
      .orderBy(asc(routineEntries.dayOfWeek), asc(routineEntries.period));
  }
}
