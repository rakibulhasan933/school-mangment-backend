import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lte,
  or,
} from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  academicSessions,
  attendance,
  exams,
  notices,
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

  /** Resolve the caller's own student row (tenant-scoped, from the JWT). */
  private async ownStudent(request: AuthenticatedRequest) {
    const [student] = await this.db
      .select()
      .from(students)
      .where(
        and(
          eq(students.schoolId, request.user.schoolId),
          eq(students.userId, request.user.id),
        ),
      )
      .limit(1);
    return student ?? null;
  }

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
    if (!row) return { data: null };
    // Enrich with the joined display names the raw rows lack (class / section /
    // session) — same names-as-FKs fix pattern as the Round-3 people lists.
    const [names] = await this.db
      .select({
        classNameBn: academicClasses.nameBn,
        sectionNameBn: sections.nameBn,
        sectionShift: sections.shift,
        sectionGroupName: sections.groupName,
        sessionName: academicSessions.name,
      })
      .from(students)
      .leftJoin(academicClasses, eq(academicClasses.id, students.classId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .leftJoin(academicSessions, eq(academicSessions.id, students.sessionId))
      .where(eq(students.id, row.student.id))
      .limit(1);
    return { data: { ...row, ...(names ?? {}) } };
  }

  @Get('attendance') async attendanceForStudent(
    @Req() request: AuthenticatedRequest,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const student = await this.ownStudent(request);
    if (!student) return { data: [] };
    // Optional month filter: ?month=YYYY-MM or ?year=YYYY&month=M|MM.
    // attendanceDate is stored as ISO text (YYYY-MM-DD), so a lexicographic
    // range compare is exact. Without params the previous behaviour
    // (all rows, ascending) is preserved.
    let ym: string | null = null;
    if (month && /^\d{4}-\d{2}$/.test(month)) ym = month;
    else if (year && month) {
      const y = Number(year);
      const m = Number(month);
      if (Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12)
        ym = `${y}-${String(m).padStart(2, '0')}`;
    }
    const rows = await this.db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.schoolId, request.user.schoolId),
          eq(attendance.studentId, student.id),
          ...(ym
            ? [
                gte(attendance.attendanceDate, `${ym}-01`),
                lte(attendance.attendanceDate, `${ym}-31`),
              ]
            : []),
        ),
      )
      .orderBy(asc(attendance.attendanceDate));
    return { data: rows };
  }

  @Get('notices') async noticesForStudent(
    @Req() request: AuthenticatedRequest,
  ) {
    const student = await this.ownStudent(request);
    if (!student) return { data: [] };
    const [cls] = student.classId
      ? await this.db
          .select({ nameBn: academicClasses.nameBn })
          .from(academicClasses)
          .where(eq(academicClasses.id, student.classId))
          .limit(1)
      : [];
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
          eq(notices.schoolId, request.user.schoolId),
          eq(notices.isPublished, true),
          or(isNull(notices.publishAt), lte(notices.publishAt, now)),
          or(isNull(notices.expiresAt), gt(notices.expiresAt, now)),
        ),
      )
      .orderBy(desc(notices.isPinned), desc(notices.createdAt));
    // Audience targeting: general audiences always apply; a class-targeted
    // notice applies only when its target matches the student's class
    // (the admin stores either the class id or the class name there).
    const data = rows.filter((row) => {
      const audience = (row.audience ?? 'public').toLowerCase();
      // Staff-only audiences never reach students; everything else
      // (public / student / all / class-targeted) is student-visible.
      if (['teacher', 'teachers', 'admin', 'staff'].includes(audience))
        return false;
      const target = row.audienceClass?.trim();
      if (!target) return true;
      return (
        target === student.classId || (!!cls && target === cls.nameBn)
      );
    });
    return { data };
  }

  @Get('upcoming-results') async upcomingResults(
    @Req() request: AuthenticatedRequest,
  ) {
    const student = await this.ownStudent(request);
    if (!student?.classId) return { data: [] };
    const now = new Date();
    const rows = await this.db
      .select({
        id: exams.id,
        nameBn: exams.nameBn,
        publishAt: exams.publishAt,
        countdownEnabled: exams.countdownEnabled,
        classNameBn: academicClasses.nameBn,
      })
      .from(exams)
      .innerJoin(academicClasses, eq(academicClasses.id, exams.classId))
      .where(
        and(
          eq(exams.schoolId, request.user.schoolId),
          eq(exams.classId, student.classId),
          eq(exams.isPublished, true),
          eq(exams.countdownEnabled, true),
          gt(exams.publishAt, now),
        ),
      )
      .orderBy(asc(exams.publishAt));
    return { data: rows };
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
