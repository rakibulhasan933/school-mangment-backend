import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  academicSessions,
  admissionApplications,
  attendance,
  marks,
  payments,
  results,
  routineEntries,
  salaryRecords,
  sections,
  staff,
  studentFees,
  students,
  subjectAssignments,
  subjects,
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
    // List responses must carry human-readable display names. The bare rows
    // only hold foreign-key UUIDs (a student's name lives on its user row),
    // which is why the admin UI used to render raw UUIDs as "names".
    let rows: Array<Record<string, unknown>>;
    if (resource === 'students') {
      const joined = await this.db
        .select({
          student: students,
          nameBn: users.displayNameBn,
          registrationNumber: users.registrationNumber,
          classNameBn: academicClasses.nameBn,
          sectionNameBn: sections.nameBn,
          sessionName: academicSessions.name,
        })
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .leftJoin(
          academicClasses,
          eq(academicClasses.id, students.classId),
        )
        .leftJoin(sections, eq(sections.id, students.sectionId))
        .leftJoin(
          academicSessions,
          eq(academicSessions.id, students.sessionId),
        )
        .where(eq(students.schoolId, schoolId))
        .orderBy(asc(students.createdAt));
      rows = joined.map((row) => ({
        ...row.student,
        nameBn: row.nameBn,
        displayNameBn: row.nameBn,
        registrationNumber: row.registrationNumber,
        classNameBn: row.classNameBn,
        sectionNameBn: row.sectionNameBn,
        sessionName: row.sessionName,
      }));
    } else if (resource === 'teachers') {
      const joined = await this.db
        .select({
          teacher: teachers,
          nameBn: users.displayNameBn,
          username: users.username,
          email: users.email,
        })
        .from(teachers)
        .innerJoin(users, eq(users.id, teachers.userId))
        .where(eq(teachers.schoolId, schoolId))
        .orderBy(asc(teachers.createdAt));
      rows = joined.map((row) => ({
        ...row.teacher,
        nameBn: row.nameBn,
        displayNameBn: row.nameBn,
        username: row.username,
        email: row.email,
      }));
    } else if (resource === 'subjectAssignments') {
      const joined = await this.db
        .select({
          assignment: subjectAssignments,
          teacherNameBn: users.displayNameBn,
          teacherCode: teachers.teacherCode,
          subjectNameBn: subjects.nameBn,
          classNameBn: academicClasses.nameBn,
          sectionNameBn: sections.nameBn,
        })
        .from(subjectAssignments)
        .innerJoin(teachers, eq(teachers.id, subjectAssignments.teacherId))
        .innerJoin(users, eq(users.id, teachers.userId))
        .innerJoin(subjects, eq(subjects.id, subjectAssignments.subjectId))
        .innerJoin(
          academicClasses,
          eq(academicClasses.id, subjectAssignments.classId),
        )
        .leftJoin(sections, eq(sections.id, subjectAssignments.sectionId))
        .where(eq(subjectAssignments.schoolId, schoolId))
        .orderBy(asc(subjectAssignments.createdAt));
      rows = joined.map((row) => ({
        ...row.assignment,
        teacherNameBn: row.teacherNameBn,
        teacherCode: row.teacherCode,
        subjectNameBn: row.subjectNameBn,
        classNameBn: row.classNameBn,
        sectionNameBn: row.sectionNameBn,
      }));
    } else {
      const table = tables[resource];
      rows = (await this.db
        .select()
        .from(table)
        .where(eq(table.schoolId, schoolId))
        .orderBy(asc(table.createdAt))) as Array<Record<string, unknown>>;
    }
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
        // B2: every field the admin form collects must be persisted —
        // these were silently dropped here, so profiles showed "—" for
        // জন্ম তারিখ / লিঙ্গ / ধর্ম / রক্তের গ্রুপ / ঠিকানা despite the
        // form sending them (the columns have existed since 0000).
        dateOfBirth: value.dateOfBirth ? String(value.dateOfBirth) : undefined,
        birthCertificateNumber: value.birthCertificateNumber
          ? String(value.birthCertificateNumber)
          : undefined,
        gender: value.gender ? String(value.gender) : undefined,
        religion: value.religion ? String(value.religion) : undefined,
        bloodGroup: value.bloodGroup ? String(value.bloodGroup) : undefined,
        guardianMobile: value.guardianMobile
          ? String(value.guardianMobile)
          : undefined,
        presentAddress: value.presentAddress
          ? String(value.presentAddress)
          : undefined,
        permanentAddress: value.permanentAddress
          ? String(value.permanentAddress)
          : undefined,
        previousInstitution: value.previousInstitution
          ? String(value.previousInstitution)
          : undefined,
        admissionDate: value.admissionDate
          ? String(value.admissionDate)
          : undefined,
        photoUrl: value.photoUrl ? String(value.photoUrl) : undefined,
      })
      .returning();
    return { data: { ...student, registrationNumber } };
  }
  async createTeacher(user: AuthUser, value: Record<string, unknown>) {
    const displayNameBn = String(
      value.displayNameBn ?? value.nameBn ?? '',
    ).trim();
    if (!displayNameBn)
      throw new BadRequestException('শিক্ষকের নাম আবশ্যক');
    const existing = await this.db
      .select({ teacherCode: teachers.teacherCode })
      .from(teachers)
      .where(eq(teachers.schoolId, user.schoolId));
    const teacherCode =
      String(value.teacherCode ?? '').trim() ||
      `T-${String(existing.length + 1).padStart(3, '0')}`;
    if (existing.some((row) => row.teacherCode === teacherCode))
      throw new BadRequestException('এই শিক্ষক কোডটি ইতিমধ্যে ব্যবহৃত হয়েছে');
    const username =
      String(value.username ?? '').trim() ||
      teacherCode.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const providedPassword = String(value.password ?? '').trim();
    const temporaryPassword =
      providedPassword || `Teacher@${randomBytes(5).toString('hex')}`;
    const [account] = await this.db
      .insert(users)
      .values({
        schoolId: user.schoolId,
        role: 'TEACHER',
        username,
        email: value.email ? String(value.email) : undefined,
        passwordHash: await argon2.hash(temporaryPassword),
        displayNameBn,
      })
      .returning();
    if (!account) throw new Error('শিক্ষকের অ্যাকাউন্ট তৈরি করা যায়নি');
    const [teacher] = await this.db
      .insert(teachers)
      .values({
        schoolId: user.schoolId,
        userId: account.id,
        teacherCode,
        nameEn: value.nameEn ? String(value.nameEn) : undefined,
        designation: value.designation
          ? String(value.designation)
          : 'সহকারী শিক্ষক',
        qualification: value.qualification
          ? String(value.qualification)
          : undefined,
        mobile: value.mobile ? String(value.mobile) : undefined,
        nid: value.nid ? String(value.nid) : undefined,
        joiningDate: value.joiningDate ? String(value.joiningDate) : undefined,
        monthlySalary: value.monthlySalary
          ? Number(value.monthlySalary)
          : 0,
        photoUrl: value.photoUrl ? String(value.photoUrl) : undefined,
      })
      .returning();
    return {
      data: {
        ...teacher,
        nameBn: displayNameBn,
        displayNameBn,
        username,
        // Returned once so the admin can hand the login to the teacher;
        // afterwards only a reset (existing flow) can change it.
        ...(providedPassword ? {} : { temporaryPassword }),
      },
    };
  }
  async create(
    resource: Resource,
    user: AuthUser,
    value: Record<string, unknown>,
  ) {
    if (resource === 'students') return this.createStudent(user, value);
    if (resource === 'teachers') return this.createTeacher(user, value);
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
    // A person's display name lives on the linked user row, not on the
    // student/teacher row — route name edits there and strip the key so it
    // never reaches the domain table update.
    const { displayNameBn, nameBn, ...fields } = value;
    const nextName = displayNameBn ?? nameBn;
    const [row] = await this.db
      .update(table)
      .set({ ...fields, updatedAt: new Date() } as never)
      .where(and(eq(table.id, id), eq(table.schoolId, user.schoolId) as never))
      .returning();
    if (!row) throw new NotFoundException('রেকর্ড পাওয়া যায়নি');
    if (
      nextName !== undefined &&
      (resource === 'students' || resource === 'teachers')
    ) {
      await this.db
        .update(users)
        .set({ displayNameBn: String(nextName), updatedAt: new Date() })
        .where(
          eq(
            users.id,
            (row as { userId: string }).userId,
          ),
        );
      return {
        data: {
          ...(row as Record<string, unknown>),
          nameBn: String(nextName),
          displayNameBn: String(nextName),
        },
      };
    }
    return { data: row };
  }
  /**
   * B12: school-scoped deletes for people resources, with referential
   * guards. Financial/academic history (payments, marks, results,
   * salary) blocks deletion with a clear 400; only the person's own
   * lightweight rows (unpaid dues, subject assignments, routine slots)
   * cascade, together with the linked login account.
   */
  async remove(resource: Resource, user: AuthUser, id: string) {
    if (resource === 'students') return this.removeStudent(user, id);
    if (resource === 'teachers') return this.removeTeacher(user, id);
    const table = tables[resource];
    const [row] = await this.db
      .delete(table)
      .where(and(eq(table.id, id), eq(table.schoolId, user.schoolId)))
      .returning();
    if (!row) throw new NotFoundException('রেকর্ড পাওয়া যায়নি');
    return { data: { id } };
  }
  private async removeStudent(user: AuthUser, id: string) {
    const [student] = await this.db
      .select()
      .from(students)
      .where(and(eq(students.id, id), eq(students.schoolId, user.schoolId)))
      .limit(1);
    if (!student) throw new NotFoundException('শিক্ষার্থী পাওয়া যায়নি');
    const [paymentRows, markRows, resultRows, attendanceRows, allFees] =
      await Promise.all([
        this.db
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.studentId, id))
          .limit(1),
        this.db
          .select({ id: marks.id })
          .from(marks)
          .where(eq(marks.studentId, id))
          .limit(1),
        this.db
          .select({ id: results.id })
          .from(results)
          .where(eq(results.studentId, id))
          .limit(1),
        this.db
          .select({ id: attendance.id })
          .from(attendance)
          .where(eq(attendance.studentId, id))
          .limit(1),
        this.db
          .select({ id: studentFees.id, paidAmount: studentFees.paidAmount })
          .from(studentFees)
          .where(eq(studentFees.studentId, id)),
      ]);
    const hasPaidFee = allFees.some((row) => row.paidAmount > 0);
    if (
      paymentRows.length ||
      markRows.length ||
      resultRows.length ||
      attendanceRows.length ||
      hasPaidFee
    )
      throw new BadRequestException(
        'এই শিক্ষার্থীর হাজিরা/নম্বর/ফলাফল/পেমেন্ট রেকর্ড আছে, তাই মোছা যাবে না',
      );
    await this.db.transaction(async (tx) => {
      if (allFees.length)
        await tx.delete(studentFees).where(eq(studentFees.studentId, id));
      await tx
        .update(admissionApplications)
        .set({ studentId: null, updatedAt: new Date() })
        .where(eq(admissionApplications.studentId, id));
      await tx
        .delete(students)
        .where(and(eq(students.id, id), eq(students.schoolId, user.schoolId)));
      await tx.delete(users).where(eq(users.id, student.userId));
    });
    return { data: { id } };
  }
  private async removeTeacher(user: AuthUser, id: string) {
    const [teacher] = await this.db
      .select()
      .from(teachers)
      .where(and(eq(teachers.id, id), eq(teachers.schoolId, user.schoolId)))
      .limit(1);
    if (!teacher) throw new NotFoundException('শিক্ষক পাওয়া যায়নি');
    const [salaryRows, markRows] = await Promise.all([
      this.db
        .select({ id: salaryRecords.id })
        .from(salaryRecords)
        .where(eq(salaryRecords.teacherId, id))
        .limit(1),
      this.db
        .select({ id: marks.id })
        .from(marks)
        .where(eq(marks.teacherId, id))
        .limit(1),
    ]);
    if (salaryRows.length || markRows.length)
      throw new BadRequestException(
        'এই শিক্ষকের বেতন/নম্বর এন্ট্রির রেকর্ড আছে, তাই মোছা যাবে না',
      );
    await this.db.transaction(async (tx) => {
      await tx
        .delete(subjectAssignments)
        .where(eq(subjectAssignments.teacherId, id));
      await tx
        .delete(routineEntries)
        .where(eq(routineEntries.teacherId, id));
      await tx
        .delete(teachers)
        .where(and(eq(teachers.id, id), eq(teachers.schoolId, user.schoolId)));
      await tx.delete(users).where(eq(users.id, teacher.userId));
    });
    return { data: { id } };
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
