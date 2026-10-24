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
import { createDb, type Database } from '../db/index.js';
import {
  academicClasses,
  academicSessions,
  attendance,
  exams,
  notices,
  results,
  routineEntries,
  sections,
  studentFees,
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
import { resolveOwnStudent } from './own-student.js';
import { deriveFeeStatus } from '../finance/money.js';

/**
 * Student portal (Round 6, B1 rewrite).
 *
 * Every handler resolves the caller's own student row FIRST (by the
 * token's user id) and then queries with the STUDENT ROW's schoolId —
 * never the raw token schoolId alone. The token school comes from the
 * user account, and when account and student record drift into
 * different schools every tenant-filtered query misses, which is
 * exactly the live failure (login OK, all screens empty, profile
 * unresolved). See own-student.ts.
 */
@Controller('student/portal')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('STUDENT')
export class StudentPortalController {
  private readonly db: Database = createDb();

  private own(request: AuthenticatedRequest) {
    return resolveOwnStudent(this.db, request.user);
  }

  @Get('profile') async profile(@Req() request: AuthenticatedRequest) {
    const own = await this.own(request);
    if (!own) return { data: null };
    const { student } = own;
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, student.userId))
      .limit(1);
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
      .where(eq(students.id, student.id))
      .limit(1);
    return { data: { student, user: user ?? null, ...(names ?? {}) } };
  }

  /**
   * Dashboard aggregates in one call, all derived from the student's
   * own school: dues totals, attendance summary, latest published
   * result, visible notice count and upcoming result countdowns.
   */
  @Get('dashboard') async dashboard(@Req() request: AuthenticatedRequest) {
    const own = await this.own(request);
    if (!own) return { data: null };
    const { student, schoolId } = own;
    const [fees, attendanceRows, noticeRows, upcoming] = await Promise.all([
      this.db
        .select()
        .from(studentFees)
        .where(
          and(
            eq(studentFees.schoolId, schoolId),
            eq(studentFees.studentId, student.id),
          ),
        ),
      this.db
        .select({ status: attendance.status })
        .from(attendance)
        .where(
          and(
            eq(attendance.schoolId, schoolId),
            eq(attendance.studentId, student.id),
          ),
        ),
      this.visibleNotices(schoolId, student),
      this.upcomingRows(schoolId, student),
    ]);
    const totalDue = fees.reduce((sum, row) => sum + row.amount, 0);
    const totalPaid = fees.reduce((sum, row) => sum + row.paidAmount, 0);
    const present = attendanceRows.filter(
      (row) => row.status === 'PRESENT',
    ).length;
    const [latest] = await this.db
      .select({
        examNameBn: exams.nameBn,
        gpa: results.gpa,
        letter: results.letter,
        isPassed: results.isPassed,
        totalMarks: results.totalMarks,
        meritPosition: results.meritPosition,
      })
      .from(results)
      .innerJoin(exams, eq(exams.id, results.examId))
      .where(
        and(
          eq(results.schoolId, schoolId),
          eq(results.studentId, student.id),
          eq(exams.isPublished, true),
          or(isNull(exams.publishAt), lte(exams.publishAt, new Date())),
        ),
      )
      .orderBy(desc(results.createdAt))
      .limit(1);
    return {
      data: {
        studentId: student.id,
        classId: student.classId,
        sectionId: student.sectionId,
        roll: student.roll,
        dues: {
          totalDue,
          totalPaid,
          outstanding: totalDue - totalPaid,
          unpaidCount: fees.filter(
            (row) => deriveFeeStatus(row.amount, row.paidAmount) !== 'PAID',
          ).length,
        },
        attendance: {
          total: attendanceRows.length,
          present,
          absent: attendanceRows.length - present,
          percentage: attendanceRows.length
            ? Math.round((present / attendanceRows.length) * 100)
            : null,
        },
        latestResult: latest ?? null,
        noticeCount: noticeRows.length,
        upcomingResultCount: upcoming.length,
      },
    };
  }

  @Get('attendance') async attendanceForStudent(
    @Req() request: AuthenticatedRequest,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const own = await this.own(request);
    if (!own) return { data: [] };
    const { student, schoolId } = own;
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
          eq(attendance.schoolId, schoolId),
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

  /** Published, in-window notices that apply to this student. */
  private async visibleNotices(
    schoolId: string,
    student: typeof students.$inferSelect,
  ) {
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
          eq(notices.schoolId, schoolId),
          eq(notices.isPublished, true),
          or(isNull(notices.publishAt), lte(notices.publishAt, now)),
          or(isNull(notices.expiresAt), gt(notices.expiresAt, now)),
        ),
      )
      .orderBy(desc(notices.isPinned), desc(notices.createdAt));
    // Audience targeting: general audiences always apply; a class-targeted
    // notice applies only when its target matches the student's class
    // (the admin stores either the class id or the class name there).
    return rows.filter((row) => {
      const audience = (row.audience ?? 'public').toLowerCase();
      // Staff-only audiences never reach students; everything else
      // (public / student / all / class-targeted) is student-visible.
      if (['teacher', 'teachers', 'admin', 'staff'].includes(audience))
        return false;
      const target = row.audienceClass?.trim();
      if (!target) return true;
      return target === student.classId || (!!cls && target === cls.nameBn);
    });
  }

  @Get('notices') async noticesForStudent(
    @Req() request: AuthenticatedRequest,
  ) {
    const own = await this.own(request);
    if (!own) return { data: [] };
    return { data: await this.visibleNotices(own.schoolId, own.student) };
  }

  private async upcomingRows(
    schoolId: string,
    student: typeof students.$inferSelect,
  ) {
    if (!student.classId) return [];
    const now = new Date();
    return this.db
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
          eq(exams.schoolId, schoolId),
          eq(exams.classId, student.classId),
          eq(exams.isPublished, true),
          eq(exams.countdownEnabled, true),
          gt(exams.publishAt, now),
        ),
      )
      .orderBy(asc(exams.publishAt));
  }

  @Get('upcoming-results') async upcomingResults(
    @Req() request: AuthenticatedRequest,
  ) {
    const own = await this.own(request);
    if (!own) return { data: [] };
    return { data: await this.upcomingRows(own.schoolId, own.student) };
  }

  @Get('routine') async routine(@Req() request: AuthenticatedRequest) {
    const own = await this.own(request);
    const classId = own?.student.classId;
    if (!own || !classId)
      return { data: [], message: 'রুটিন Admin আপলোড করলে এখানে দেখা যাবে' };
    const { student, schoolId } = own;
    const conditions = [
      eq(routineEntries.schoolId, schoolId),
      eq(routineEntries.classId, classId),
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
