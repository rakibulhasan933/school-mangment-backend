import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { and, eq, asc } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  routineEntries,
  sections,
  subjects,
  teachers,
  users,
} from '../db/schema.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';

@Controller('teacher/portal')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('TEACHER')
export class TeacherPortalController {
  private readonly db = createDb();
  @Get('profile') async profile(@Req() request: AuthenticatedRequest) {
    const [row] = await this.db
      .select({ teacher: teachers, user: users })
      .from(teachers)
      .innerJoin(users, eq(users.id, teachers.userId))
      .where(
        and(
          eq(teachers.schoolId, request.user.schoolId),
          eq(teachers.userId, request.user.id),
        ),
      )
      .limit(1);
    return { data: row ?? null };
  }
  @Get('routine') async routine(@Req() request: AuthenticatedRequest) {
    const [teacher] = await this.db
      .select({ id: teachers.id })
      .from(teachers)
      .where(
        and(
          eq(teachers.schoolId, request.user.schoolId),
          eq(teachers.userId, request.user.id),
        ),
      )
      .limit(1);
    if (!teacher) return { data: [] };
    const rows = await this.db
      .select({
        id: routineEntries.id,
        dayOfWeek: routineEntries.dayOfWeek,
        period: routineEntries.period,
        room: routineEntries.room,
        subjectNameBn: subjects.nameBn,
        classNameBn: academicClasses.nameBn,
        sectionNameBn: sections.nameBn,
      })
      .from(routineEntries)
      .innerJoin(subjects, eq(subjects.id, routineEntries.subjectId))
      .innerJoin(
        academicClasses,
        eq(academicClasses.id, routineEntries.classId),
      )
      .leftJoin(sections, eq(sections.id, routineEntries.sectionId))
      .where(
        and(
          eq(routineEntries.schoolId, request.user.schoolId),
          eq(routineEntries.teacherId, teacher.id),
        ),
      )
      .orderBy(asc(routineEntries.dayOfWeek), asc(routineEntries.period));
    return { data: rows };
  }
}
