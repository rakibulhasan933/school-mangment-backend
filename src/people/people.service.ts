import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  academicSessions,
  staff,
  students,
  subjectAssignments,
  teachers,
  users,
} from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';

const tables = { students, teachers, staff, subjectAssignments } as const;
type Resource = keyof typeof tables;

@Injectable()
export class PeopleService {
  private readonly db = createDb();
  async list(resource: Resource, schoolId: string, search?: string) {
    const table = tables[resource];
    const condition =
      'schoolId' in table ? eq(table.schoolId, schoolId) : undefined;
    const rows = await this.db
      .select()
      .from(table)
      .where(condition as never)
      .orderBy(asc(table.createdAt));
    if (!search) return { data: rows };
    return {
      data: rows.filter((row) =>
        JSON.stringify(row).toLowerCase().includes(search.toLowerCase()),
      ),
    };
  }
  async createStudent(user: AuthUser, value: Record<string, unknown>) {
    const sessionId = String(value.sessionId ?? '');
    const classId = String(value.classId ?? '');
    const session = sessionId
      ? await this.db
          .select()
          .from(academicSessions)
          .where(
            and(
              eq(academicSessions.id, sessionId),
              eq(academicSessions.schoolId, user.schoolId),
            ),
          )
          .limit(1)
      : [];
    const cls = classId
      ? await this.db
          .select()
          .from(academicClasses)
          .where(
            and(
              eq(academicClasses.id, classId),
              eq(academicClasses.schoolId, user.schoolId),
            ),
          )
          .limit(1)
      : [];
    if (!session[0] || !cls[0])
      throw new NotFoundException('সেশন ও শ্রেণি নির্বাচন করুন');
    const count = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.schoolId, user.schoolId), eq(users.role, 'STUDENT')));
    const registrationNumber = `${String(session[0].year).slice(-2)}${String(Number(cls[0].orderIndex) + 5).padStart(2, '0')}${String(count.length + 1).padStart(4, '0')}`;
    const [account] = await this.db
      .insert(users)
      .values({
        schoolId: user.schoolId,
        role: 'STUDENT',
        registrationNumber,
        displayNameBn: String(
          value.displayNameBn ?? value.nameBn ?? 'শিক্ষার্থী',
        ),
      })
      .returning();
    const [student] = await this.db
      .insert(students)
      .values({
        schoolId: user.schoolId,
        userId: account.id,
        sessionId,
        classId,
        sectionId: value.sectionId ? String(value.sectionId) : undefined,
        roll: value.roll ? Number(value.roll) : undefined,
        nameEn: value.nameEn ? String(value.nameEn) : undefined,
        fatherNameBn: value.fatherNameBn
          ? String(value.fatherNameBn)
          : undefined,
        motherNameBn: value.motherNameBn
          ? String(value.motherNameBn)
          : undefined,
        guardianMobile: value.guardianMobile
          ? String(value.guardianMobile)
          : undefined,
      })
      .returning();
    return { data: { ...student, registrationNumber } };
  }
  async create(
    resource: Resource,
    user: AuthUser,
    value: Record<string, unknown>,
  ) {
    if (resource === 'students') return this.createStudent(user, value);
    const table = tables[resource];
    const [row] = await this.db
      .insert(table)
      .values({ ...value, schoolId: user.schoolId } as never)
      .returning();
    return { data: row };
  }
  async update(
    resource: Resource,
    user: AuthUser,
    id: string,
    value: Record<string, unknown>,
  ) {
    const table = tables[resource];
    const [row] = await this.db
      .update(table)
      .set({ ...value, updatedAt: new Date() } as never)
      .where(and(eq(table.id, id), eq(table.schoolId, user.schoolId) as never))
      .returning();
    if (!row) throw new NotFoundException('রেকর্ড পাওয়া যায়নি');
    return { data: row };
  }
  async promote(
    user: AuthUser,
    value: {
      studentIds: string[];
      sessionId: string;
      classId: string;
      sectionId?: string;
    },
  ) {
    const updated = [];
    for (const id of value.studentIds) {
      const [row] = await this.db
        .update(students)
        .set({
          sessionId: value.sessionId,
          classId: value.classId,
          sectionId: value.sectionId,
          updatedAt: new Date(),
        })
        .where(and(eq(students.id, id), eq(students.schoolId, user.schoolId)))
        .returning();
      if (row) updated.push(row);
    }
    return { data: updated, count: updated.length };
  }
  async importRows(user: AuthUser, rows: Array<Record<string, unknown>>) {
    const results = [];
    const errors: Array<{
      row: number;
      message: string;
      value: Record<string, unknown>;
    }> = [];
    for (const [index, row] of rows.entries()) {
      try {
        results.push(await this.createStudent(user, row));
      } catch (error: unknown) {
        errors.push({
          row: index + 1,
          message:
            error instanceof Error
              ? error.message
              : 'রেকর্ড সংরক্ষণ করা যায়নি',
          value: row,
        });
      }
    }
    return { data: results, imported: results.length, errors };
  }
  parseCsv(csv: string) {
    const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
    const headers = (headerLine ?? '')
      .split(',')
      .map((header) => header.trim());
    return lines
      .filter(Boolean)
      .map((line) =>
        Object.fromEntries(
          line
            .split(',')
            .map((value, index) => [
              headers[index] ?? `column${index + 1}`,
              value.trim(),
            ]),
        ),
      );
  }
}
