import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { and, eq, asc, desc, gt, isNull, lte, or } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  notices,
  routineEntries,
  sections,
  subjectAssignments,
  subjects,
  teachers,
  users,
} from '../db/schema.js';
import { resolveOwnTeacher } from './own-student.js';
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
  /**
   * B9: the teacher dashboard's "সাম্প্রতিক বিজ্ঞপ্তি" was always empty —
   * no teacher-facing notices endpoint existed, and the only notices
   * list (GET /content/notices) is ADMIN-only, so teacher tokens got
   * 403. This serves published, in-window notices addressed to everyone
   * or to teachers/staff, from the teacher's OWN school.
   */
  @Get('notices') async noticesForTeacher(
    @Req() request: AuthenticatedRequest,
  ) {
    const own = await resolveOwnTeacher(this.db, request.user);
    if (!own) return { data: [] };
    const now = new Date();
    const rows = await this.db
      .select({
        id: notices.id,
        titleBn: notices.titleBn,
        details: notices.details,
        category: notices.category,
        attachmentUrl: notices.attachmentUrl,
        isPinned: notices.isPinned,
        publishAt: notices.publishAt,
        createdAt: notices.createdAt,
        audience: notices.audience,
        audienceClass: notices.audienceClass,
      })
      .from(notices)
      .where(
        and(
          eq(notices.schoolId, own.schoolId),
          eq(notices.isPublished, true),
          or(isNull(notices.publishAt), lte(notices.publishAt, now)),
          or(isNull(notices.expiresAt), gt(notices.expiresAt, now)),
        ),
      )
      .orderBy(desc(notices.isPinned), desc(notices.createdAt));
    const data = rows.filter((row) => {
      const audience = (row.audience ?? 'public').toLowerCase();
      // Class-targeted student notices are not the teacher's feed;
      // general / teacher / staff audiences are.
      if (audience === 'student' || audience === 'students') return false;
      if (row.audienceClass?.trim()) return false;
      return true;
    });
    return { data };
  }
  @Get('assignments') async assignments(@Req() request: AuthenticatedRequest) {
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
        id: subjectAssignments.id,
        subjectId: subjectAssignments.subjectId,
        subjectNameBn: subjects.nameBn,
        classId: subjectAssignments.classId,
        classNameBn: academicClasses.nameBn,
        sectionId: subjectAssignments.sectionId,
        sectionNameBn: sections.nameBn,
      })
      .from(subjectAssignments)
      .innerJoin(subjects, eq(subjects.id, subjectAssignments.subjectId))
      .innerJoin(
        academicClasses,
        eq(academicClasses.id, subjectAssignments.classId),
      )
      .leftJoin(sections, eq(sections.id, subjectAssignments.sectionId))
      .where(
        and(
          eq(subjectAssignments.schoolId, request.user.schoolId),
          eq(subjectAssignments.teacherId, teacher.id),
        ),
      )
      .orderBy(asc(academicClasses.orderIndex), asc(subjects.orderIndex));
    return { data: rows };
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
