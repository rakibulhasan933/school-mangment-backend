import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, lte, or, isNull } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  examSubjects,
  exams,
  gradingScales,
  marks,
  resultSubjects,
  results,
  students,
  subjects,
  users,
} from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  processStudentResult,
  validateScale,
  type GradeScale,
} from './processing.js';

@Injectable()
export class ResultsService {
  private readonly db = createDb();
  async scales(schoolId: string) {
    return {
      data: await this.db
        .select()
        .from(gradingScales)
        .where(eq(gradingScales.schoolId, schoolId))
        .orderBy(asc(gradingScales.minMarks)),
    };
  }
  async saveScale(
    user: AuthUser,
    value: {
      minMarks: number;
      maxMarks: number;
      letter: string;
      gpa: number;
      orderIndex?: number;
    },
  ) {
    const current = await this.scales(user.schoolId);
    validateScale([
      ...current.data.map((row) => ({
        minMarks: row.minMarks,
        maxMarks: row.maxMarks,
        letter: row.letter,
        gpa: Number(row.gpa),
      })),
      value,
    ]);
    const [row] = await this.db
      .insert(gradingScales)
      .values({ ...value, gpa: String(value.gpa), schoolId: user.schoolId })
      .returning();
    return { data: row };
  }
  async exams(schoolId: string) {
    return {
      data: await this.db
        .select()
        .from(exams)
        .where(eq(exams.schoolId, schoolId))
        .orderBy(asc(exams.createdAt)),
    };
  }
  async publish(
    user: AuthUser,
    examId: string,
    value: { publishAt?: string; countdownEnabled?: boolean },
  ) {
    const [row] = await this.db
      .update(exams)
      .set({
        isPublished: !value.publishAt,
        publishAt: value.publishAt ? new Date(value.publishAt) : null,
        countdownEnabled: value.countdownEnabled ?? false,
        updatedAt: new Date(),
      })
      .where(and(eq(exams.id, examId), eq(exams.schoolId, user.schoolId)))
      .returning();
    if (!row) throw new NotFoundException('পরীক্ষা পাওয়া যায়নি');
    return { data: row };
  }
  async createExam(user: AuthUser, value: Record<string, unknown>) {
    const [row] = await this.db
      .insert(exams)
      .values({ ...value, schoolId: user.schoolId } as never)
      .returning();
    return { data: row };
  }
  async saveMark(
    user: AuthUser,
    value: {
      examSubjectId: string;
      studentId: string;
      cq?: number;
      mcq?: number;
      practical?: number;
      isAbsent?: boolean;
    },
  ) {
    const [configuration] = await this.db
      .select()
      .from(examSubjects)
      .where(eq(examSubjects.id, value.examSubjectId))
      .limit(1);
    if (!configuration)
      throw new NotFoundException('পরীক্ষার বিষয় পাওয়া যায়নি');
    const existing = await this.db
      .select()
      .from(marks)
      .where(
        and(
          eq(marks.examSubjectId, value.examSubjectId),
          eq(marks.studentId, value.studentId),
        ),
      )
      .limit(1);
    if (user.role === 'TEACHER' && existing[0]?.isLocked)
      throw new ForbiddenException(
        'এই নম্বর Admin অনুমোদন ছাড়া পরিবর্তন করা যাবে না',
      );
    const cq = value.isAbsent ? 0 : (value.cq ?? 0);
    const mcq = value.isAbsent ? 0 : (value.mcq ?? 0);
    const practical = value.isAbsent ? 0 : (value.practical ?? 0);
    if (
      cq > configuration.cqMarks ||
      mcq > configuration.mcqMarks ||
      practical > configuration.practicalMarks ||
      cq < 0 ||
      mcq < 0 ||
      practical < 0
    )
      throw new ForbiddenException('নম্বরের সর্বোচ্চ সীমা অতিক্রম করেছে');
    const row = {
      schoolId: user.schoolId,
      examSubjectId: value.examSubjectId,
      studentId: value.studentId,
      cq,
      mcq,
      practical,
      total: cq + mcq + practical,
      isAbsent: value.isAbsent ?? false,
      isSubmitted: true,
      isLocked: user.role === 'TEACHER',
      submittedAt: new Date(),
    };
    const [saved] = existing[0]
      ? await this.db
          .update(marks)
          .set(row)
          .where(eq(marks.id, existing[0].id))
          .returning()
      : await this.db
          .insert(marks)
          .values({
            ...row,
            teacherId: user.role === 'TEACHER' ? undefined : undefined,
          })
          .returning();
    return { data: saved };
  }
  async unlockMark(user: AuthUser, markId: string) {
    const [row] = await this.db
      .update(marks)
      .set({ isLocked: false, approvedBy: user.id, updatedAt: new Date() })
      .where(and(eq(marks.id, markId), eq(marks.schoolId, user.schoolId)))
      .returning();
    if (!row) throw new NotFoundException('নম্বর পাওয়া যায়নি');
    return { data: row };
  }
  async process(user: AuthUser, examId: string, classId: string) {
    const [exam] = await this.db
      .select()
      .from(exams)
      .where(
        and(
          eq(exams.id, examId),
          eq(exams.schoolId, user.schoolId),
          eq(exams.classId, classId),
        ),
      )
      .limit(1);
    if (!exam) throw new NotFoundException('পরীক্ষা পাওয়া যায়নি');
    const scaleRows = await this.scales(user.schoolId);
    const scale: GradeScale[] = scaleRows.data.map((row) => ({
      minMarks: row.minMarks,
      maxMarks: row.maxMarks,
      letter: row.letter,
      gpa: Number(row.gpa),
    }));
    const configurations = await this.db
      .select()
      .from(examSubjects)
      .where(eq(examSubjects.examId, examId));
    const classStudents = await this.db
      .select()
      .from(students)
      .where(
        and(
          eq(students.schoolId, user.schoolId),
          eq(students.classId, classId),
        ),
      );
    const old = await this.db
      .select({ id: results.id })
      .from(results)
      .where(and(eq(results.examId, examId), eq(results.classId, classId)));
    if (old.length) {
      await this.db.delete(resultSubjects).where(
        inArray(
          resultSubjects.resultId,
          old.map((row) => row.id),
        ),
      );
      await this.db.delete(results).where(
        inArray(
          results.id,
          old.map((row) => row.id),
        ),
      );
    }
    const processed = [];
    for (const student of classStudents) {
      const subjectMarks = [];
      for (const configuration of configurations) {
        const [mark] = await this.db
          .select()
          .from(marks)
          .where(
            and(
              eq(marks.examSubjectId, configuration.id),
              eq(marks.studentId, student.id),
            ),
          )
          .limit(1);
        subjectMarks.push({
          total: mark?.total ?? 0,
          passMarks: configuration.passMarks,
          isAbsent: mark?.isAbsent ?? false,
        });
      }
      const result = processStudentResult(
        subjectMarks,
        scale,
        exam.failAnySubject,
      );
      processed.push({ student, result, subjectMarks, configurations });
    }
    processed.sort(
      (a, b) => b.result.gpa - a.result.gpa || b.result.total - a.result.total,
    );
    for (const [index, item] of processed.entries()) {
      const [saved] = await this.db
        .insert(results)
        .values({
          schoolId: user.schoolId,
          examId,
          studentId: item.student.id,
          classId,
          totalMarks: item.result.total,
          gpa: item.result.gpa.toFixed(2),
          letter: item.result.letter,
          isPassed: item.result.isPassed,
          meritPosition: index + 1,
        })
        .returning();
      await this.db
        .insert(resultSubjects)
        .values(
          item.configurations.map((configuration, subjectIndex) => ({
            resultId: saved!.id,
            examSubjectId: configuration.id,
            totalMarks: item.subjectMarks[subjectIndex]?.total ?? 0,
            letter: item.result.subjects[subjectIndex]?.letter ?? 'F',
            gpa: String(item.result.subjects[subjectIndex]?.gpa ?? 0),
            isAbsent: item.result.subjects[subjectIndex]?.isAbsent ?? false,
          })),
        );
    }
    return { data: { processed: processed.length, examId, classId } };
  }
  async publicSearch(
    schoolId: string,
    registrationNumber: string,
    examId?: string,
  ) {
    const student = await this.db
      .select({ id: students.id, registrationNumber: users.registrationNumber })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .where(
        and(
          eq(students.schoolId, schoolId),
          eq(users.registrationNumber, registrationNumber),
        ),
      )
      .limit(1);
    if (!student[0]) return { data: null };
    const conditions = [
      eq(results.schoolId, schoolId),
      eq(results.studentId, student[0].id),
      eq(exams.isPublished, true),
      or(isNull(exams.publishAt), lte(exams.publishAt, new Date())),
    ];
    if (examId) conditions.push(eq(results.examId, examId));
    const rows = await this.db
      .select({ result: results, exam: exams })
      .from(results)
      .innerJoin(exams, eq(results.examId, exams.id))
      .where(and(...conditions));
    return { data: rows[0] ?? null };
  }
  async student(user: AuthUser, examId?: string) {
    const rows = await this.db
      .select({ result: results, exam: exams })
      .from(results)
      .innerJoin(exams, eq(results.examId, exams.id))
      .innerJoin(students, eq(results.studentId, students.id))
      .where(
        and(
          eq(results.schoolId, user.schoolId),
          eq(students.userId, user.id),
          eq(exams.isPublished, true),
          or(isNull(exams.publishAt), lte(exams.publishAt, new Date())),
          ...(examId ? [eq(results.examId, examId)] : []),
        ),
      );
    const data = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        subjects: await this.db
          .select({
            nameBn: subjects.nameBn,
            totalMarks: resultSubjects.totalMarks,
            letter: resultSubjects.letter,
            gpa: resultSubjects.gpa,
            isAbsent: resultSubjects.isAbsent,
          })
          .from(resultSubjects)
          .innerJoin(
            examSubjects,
            eq(resultSubjects.examSubjectId, examSubjects.id),
          )
          .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
          .where(eq(resultSubjects.resultId, row.result.id)),
      })),
    );
    return { data };
  }
}
