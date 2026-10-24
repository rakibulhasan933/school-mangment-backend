import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicSessions,
  attendance,
  settings,
  subjectAssignments,
  students,
  teachers,
  users,
} from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';

type AttendanceInput = {
  sessionId: string;
  classId: string;
  sectionId?: string;
  date: string;
  entries: Array<{ studentId: string; status: string; note?: string }>;
};

@Injectable()
export class AttendanceService {
  private readonly db = createDb();
  async roster(schoolId: string, classId: string, sectionId?: string) {
    const conditions = [
      eq(students.schoolId, schoolId),
      eq(students.classId, classId),
    ];
    if (sectionId) conditions.push(eq(students.sectionId, sectionId));
    return {
      data: await this.db
        .select({
          id: students.id,
          userId: students.userId,
          registrationNumber: users.registrationNumber,
          nameBn: users.displayNameBn,
          roll: students.roll,
        })
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .where(and(...conditions))
        .orderBy(asc(students.roll)),
    };
  }
  async save(user: AuthUser, body: AttendanceInput) {
    // Teachers cannot read the ADMIN-only academics endpoints, so a missing
    // session falls back to the school's current session.
    if (!body.sessionId) {
      const [current] = await this.db
        .select({ id: academicSessions.id })
        .from(academicSessions)
        .where(
          and(
            eq(academicSessions.schoolId, user.schoolId),
            eq(academicSessions.isCurrent, true),
          ),
        )
        .limit(1);
      const [fallback] = current
        ? [current]
        : await this.db
            .select({ id: academicSessions.id })
            .from(academicSessions)
            .where(eq(academicSessions.schoolId, user.schoolId))
            .limit(1);
      if (fallback) body = { ...body, sessionId: fallback.id };
    }
    if (user.role === 'TEACHER') {
      const today = new Date().toISOString().slice(0, 10);
      if (body.date !== today)
        throw new ForbiddenException(
          'শিক্ষক শুধু একই দিনের উপস্থিতি সংশোধন করতে পারবেন',
        );
      const teacher = await this.db
        .select({ id: teachers.id })
        .from(teachers)
        .where(
          and(
            eq(teachers.schoolId, user.schoolId),
            eq(teachers.userId, user.id),
          ),
        )
        .limit(1);
      const assignment = teacher[0]
        ? await this.db
            .select({ id: subjectAssignments.id })
            .from(subjectAssignments)
            .where(
              and(
                eq(subjectAssignments.schoolId, user.schoolId),
                eq(subjectAssignments.teacherId, teacher[0].id),
                eq(subjectAssignments.classId, body.classId),
              ),
            )
            .limit(1)
        : [];
      if (!assignment[0])
        throw new ForbiddenException('এই শ্রেণির উপস্থিতি নেওয়ার অনুমতি নেই');
    }
    const rows = body.entries.map((entry) => ({
      schoolId: user.schoolId,
      studentId: entry.studentId,
      sessionId: body.sessionId,
      classId: body.classId,
      sectionId: body.sectionId,
      attendanceDate: body.date,
      status: entry.status,
      note: entry.note,
      markedBy: user.id,
    }));
    for (const row of rows)
      await this.db
        .insert(attendance)
        .values(row)
        .onConflictDoUpdate({
          target: [attendance.studentId, attendance.attendanceDate],
          set: {
            status: row.status,
            note: row.note,
            markedBy: user.id,
            updatedAt: new Date(),
          },
        });
    return { data: rows, message: 'উপস্থিতি সংরক্ষণ হয়েছে' };
  }
  async report(schoolId: string, dateFrom?: string, dateTo?: string) {
    const conditions = [eq(attendance.schoolId, schoolId)];
    if (dateFrom) conditions.push(gte(attendance.attendanceDate, dateFrom));
    if (dateTo) conditions.push(lte(attendance.attendanceDate, dateTo));
    const records = await this.db
      .select()
      .from(attendance)
      .where(and(...conditions))
      .orderBy(asc(attendance.attendanceDate));
    const thresholdSetting = await this.db
      .select({ value: settings.value })
      .from(settings)
      .where(
        and(
          eq(settings.schoolId, schoolId),
          eq(settings.key, 'attendance_threshold'),
        ),
      )
      .limit(1);
    const thresholdValue = thresholdSetting[0]?.value;
    const threshold =
      typeof thresholdValue === 'object' &&
      thresholdValue !== null &&
      'percent' in thresholdValue &&
      typeof thresholdValue.percent === 'number'
        ? thresholdValue.percent
        : 75;
    const daily = new Map<string, { present: number; total: number }>();
    const studentTotals = new Map<string, { present: number; total: number }>();
    for (const record of records) {
      const day = daily.get(record.attendanceDate) ?? { present: 0, total: 0 };
      day.total += 1;
      if (record.status === 'PRESENT') day.present += 1;
      daily.set(record.attendanceDate, day);
      const student = studentTotals.get(record.studentId) ?? {
        present: 0,
        total: 0,
      };
      student.total += 1;
      if (record.status === 'PRESENT') student.present += 1;
      studentTotals.set(record.studentId, student);
    }
    const lowRows = [...studentTotals].filter(
      ([, value]) =>
        value.total > 0 && (value.present * 100) / value.total < threshold,
    );
    const lowIds = lowRows.map(([studentId]) => studentId);
    const lowStudents = lowIds.length
      ? await this.db
          .select({
            id: students.id,
            nameBn: users.displayNameBn,
            registrationNumber: users.registrationNumber,
            roll: students.roll,
          })
          .from(students)
          .innerJoin(users, eq(users.id, students.userId))
          .where(
            and(
              eq(students.schoolId, schoolId),
              inArray(students.id, lowIds),
            ),
          )
      : [];
    const lowById = new Map(lowStudents.map((row) => [row.id, row]));
    return {
      data: records,
      dailySummary: [...daily].map(([date, value]) => ({
        date,
        ...value,
        percentage: value.total
          ? Math.round((value.present * 10000) / value.total) / 100
          : 0,
      })),
      monthlySummary: [...daily.values()].reduce(
        (summary, value) => ({
          present: summary.present + value.present,
          total: summary.total + value.total,
        }),
        { present: 0, total: 0 },
      ),
      lowAttendance: lowRows.map(([studentId, value]) => ({
        studentId,
        studentNameBn: lowById.get(studentId)?.nameBn ?? null,
        registrationNumber: lowById.get(studentId)?.registrationNumber ?? null,
        roll: lowById.get(studentId)?.roll ?? null,
        ...value,
        percentage: Math.round((value.present * 10000) / value.total) / 100,
      })),
      threshold,
    };
  }
  /**
   * ADMIN per-student attendance for the student-profile "হাজিরা" tab
   * (Round 9). The student row must belong to the caller's school — the
   * same ownership check as the Round-8 fee statement. Returns the list
   * of months that have records, the selected month's day-by-day records
   * and summaries for both the selected month and all records. Status
   * buckets mirror report(): PRESENT / ABSENT / LEAVE.
   */
  async studentAttendance(user: AuthUser, studentId: string, month?: string) {
    const [student] = await this.db
      .select({ id: students.id })
      .from(students)
      .where(
        and(eq(students.id, studentId), eq(students.schoolId, user.schoolId)),
      )
      .limit(1);
    if (!student) throw new NotFoundException('শিক্ষার্থী পাওয়া যায়নি');
    const rows = await this.db
      .select({
        date: attendance.attendanceDate,
        status: attendance.status,
        note: attendance.note,
      })
      .from(attendance)
      .where(
        and(
          eq(attendance.schoolId, user.schoolId),
          eq(attendance.studentId, studentId),
        ),
      )
      .orderBy(asc(attendance.attendanceDate));
    const summarize = (list: typeof rows) => {
      const present = list.filter((row) => row.status === 'PRESENT').length;
      const absent = list.filter((row) => row.status === 'ABSENT').length;
      const leave = list.filter((row) => row.status === 'LEAVE').length;
      return {
        totalDays: list.length,
        present,
        absent,
        leave,
        percentage: list.length
          ? Math.round((present * 10000) / list.length) / 100
          : 0,
      };
    };
    const months = [...new Set(rows.map((row) => row.date.slice(0, 7)))].sort(
      (a, b) => (a < b ? 1 : -1),
    );
    const selected =
      month && /^\d{4}-\d{2}$/.test(month)
        ? month
        : (months[0] ?? new Date().toISOString().slice(0, 7));
    const records = rows.filter((row) => row.date.startsWith(selected));
    return {
      data: {
        month: selected,
        months,
        summary: summarize(records),
        overall: summarize(rows),
        records,
      },
    };
  }
  async public(
    schoolId: string,
    classId?: string,
    sectionId?: string,
    date?: string,
  ) {
    const conditions = [eq(attendance.schoolId, schoolId)];
    if (classId) conditions.push(eq(attendance.classId, classId));
    if (sectionId) conditions.push(eq(attendance.sectionId, sectionId));
    if (date) conditions.push(eq(attendance.attendanceDate, date));
    return {
      data: await this.db
        .select({
          date: attendance.attendanceDate,
          status: attendance.status,
          registrationNumber: users.registrationNumber,
          nameBn: users.displayNameBn,
        })
        .from(attendance)
        .innerJoin(students, eq(attendance.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(and(...conditions))
        .orderBy(asc(attendance.attendanceDate)),
    };
  }
}
