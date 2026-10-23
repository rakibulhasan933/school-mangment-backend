import { ForbiddenException, Injectable } from '@nestjs/common';
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
