import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { and, eq, asc } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  attendance,
  routineEntries,
  sections,
  students,
  subjects,
  users,
} from '../db/schema.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';

@Controller('student/portal')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('STUDENT')
export class StudentPortalController {
  private readonly db = createDb();
  @Get('profile') async profile(@Req() request: AuthenticatedRequest) {
    const [row] = await this.db
      .select({ student: students, user: users })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .where(
        and(
          eq(students.schoolId, request.user.schoolId),
          eq(students.userId, request.user.id),
        ),
      )
      .limit(1);
    return { data: row ?? null };
  }
  @Get('attendance') async attendanceForStudent(
    @Req() request: AuthenticatedRequest,
  ) {
    const [student] = await this.db
      .select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.schoolId, request.user.schoolId),
          eq(students.userId, request.user.id),
        ),
      )
      .limit(1);
    return {
      data: student
        ? await this.db
            .select()
            .from(attendance)
            .where(eq(attendance.studentId, student.id))
            .orderBy(asc(attendance.attendanceDate))
        : [],
    };
  }
  @Get('routine') async routine(@Req() request: AuthenticatedRequest) {
    const [student] = await this.db
      .select({ classId: students.classId, sectionId: students.sectionId })
      .from(students)
      .where(
        and(
          eq(students.schoolId, request.user.schoolId),
          eq(students.userId, request.user.id),
        ),
      )
      .limit(1);
    if (!student?.classId)
      return { data: [], message: 'রুটিন Admin আপলোড করলে এখানে দেখা যাবে' };
    const conditions = [
      eq(routineEntries.schoolId, request.user.schoolId),
      eq(routineEntries.classId, student.classId),
      ...(student.sectionId
        ? [eq(routineEntries.sectionId, student.sectionId)]
        : []),
    ];
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
      .where(and(...conditions))
      .orderBy(asc(routineEntries.dayOfWeek), asc(routineEntries.period));
    return { data: rows };
  }
}
