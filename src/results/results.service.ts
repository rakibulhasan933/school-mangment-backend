import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lte,
  or,
  isNull,
} from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  academicSessions,
  examSubjects,
  exams,
  gradingScales,
  marks,
  resultSubjects,
  results,
  schools,
  sections,
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
import { denseRankByTotal, examVisibility } from './public.js';
import { resolveOwnStudent } from '../people/own-student.js';
import { examScheduleError } from './exam-dates.js';

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
    const joined = await this.db
      .select({
        exam: exams,
        classNameBn: academicClasses.nameBn,
        sessionName: academicSessions.name,
        sessionYear: academicSessions.year,
      })
      .from(exams)
      .innerJoin(academicClasses, eq(academicClasses.id, exams.classId))
      .innerJoin(academicSessions, eq(academicSessions.id, exams.sessionId))
      .where(eq(exams.schoolId, schoolId))
      .orderBy(asc(exams.createdAt));
    return {
      data: joined.map((row) => ({
        ...row.exam,
        classNameBn: row.classNameBn,
        sessionName: row.sessionName,
        sessionYear: row.sessionYear,
      })),
    };
  }
  /** Exam subjects with subject names — feeds the exam form and marks entry. */
  async examSubjectsList(schoolId: string, examId: string) {
    const [exam] = await this.db
      .select({ id: exams.id })
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.schoolId, schoolId)))
      .limit(1);
    if (!exam) return { data: [] };
    const joined = await this.db
      .select({
        config: examSubjects,
        subjectNameBn: subjects.nameBn,
      })
      .from(examSubjects)
      .innerJoin(subjects, eq(subjects.id, examSubjects.subjectId))
      .where(eq(examSubjects.examId, examId))
      .orderBy(asc(examSubjects.createdAt));
    return {
      data: joined.map((row) => ({
        ...row.config,
        subjectNameBn: row.subjectNameBn,
      })),
    };
  }
  /** Create or update one subject configuration of an exam. */
  async saveExamSubject(
    user: AuthUser,
    value: {
      examId: string;
      subjectId: string;
      fullMarks: number;
      passMarks: number;
      cqMarks?: number;
      mcqMarks?: number;
      practicalMarks?: number;
    },
  ) {
    const [exam] = await this.db
      .select({ id: exams.id })
      .from(exams)
      .where(and(eq(exams.id, value.examId), eq(exams.schoolId, user.schoolId)))
      .limit(1);
    if (!exam) throw new NotFoundException('পরীক্ষা পাওয়া যায়নি');
    const fields = {
      fullMarks: value.fullMarks,
      passMarks: value.passMarks,
      cqMarks: value.cqMarks ?? 0,
      mcqMarks: value.mcqMarks ?? 0,
      practicalMarks: value.practicalMarks ?? 0,
    };
    const [existing] = await this.db
      .select({ id: examSubjects.id })
      .from(examSubjects)
      .where(
        and(
          eq(examSubjects.examId, value.examId),
          eq(examSubjects.subjectId, value.subjectId),
        ),
      )
      .limit(1);
    const [row] = existing
      ? await this.db
          .update(examSubjects)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(examSubjects.id, existing.id))
          .returning()
      : await this.db
          .insert(examSubjects)
          .values({ examId: value.examId, subjectId: value.subjectId, ...fields })
          .returning();
    return { data: row };
  }
  async removeExamSubject(user: AuthUser, id: string) {
    const [config] = await this.db
      .select({ id: examSubjects.id, examId: examSubjects.examId })
      .from(examSubjects)
      .where(eq(examSubjects.id, id))
      .limit(1);
    if (!config) throw new NotFoundException('পরীক্ষার বিষয় পাওয়া যায়নি');
    const [exam] = await this.db
      .select({ id: exams.id })
      .from(exams)
      .where(and(eq(exams.id, config.examId), eq(exams.schoolId, user.schoolId)))
      .limit(1);
    if (!exam) throw new NotFoundException('পরীক্ষা পাওয়া যায়নি');
    await this.db.delete(examSubjects).where(eq(examSubjects.id, id));
    return { data: config };
  }
  /** Existing marks for one exam subject, with student display names. */
  async marksList(schoolId: string, examSubjectId: string) {
    const joined = await this.db
      .select({
        mark: marks,
        studentNameBn: users.displayNameBn,
        registrationNumber: users.registrationNumber,
        roll: students.roll,
      })
      .from(marks)
      .innerJoin(students, eq(students.id, marks.studentId))
      .innerJoin(users, eq(users.id, students.userId))
      .where(
        and(
          eq(marks.schoolId, schoolId),
          eq(marks.examSubjectId, examSubjectId),
        ),
      )
      .orderBy(asc(students.roll));
    return {
      data: joined.map((row) => ({
        ...row.mark,
        studentNameBn: row.studentNameBn,
        registrationNumber: row.registrationNumber,
        roll: row.roll,
      })),
    };
  }
  /**
   * Admit-card data for one exam: school identity, the exam, its subjects
   * (with board codes) and every student of the exam's class. The admin
   * app renders printable admit cards from this single payload; section
   * filtering happens client-side from the section fields on each row.
   */
  async admitData(user: AuthUser, examId: string) {
    const [exam] = await this.db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.schoolId, user.schoolId)))
      .limit(1);
    if (!exam) throw new NotFoundException('পরীক্ষা পাওয়া যায়নি');
    const [school] = await this.db
      .select({
        nameBn: schools.nameBn,
        nameEn: schools.nameEn,
        eiin: schools.eiin,
        address: schools.address,
        logoUrl: schools.logoUrl,
      })
      .from(schools)
      .where(eq(schools.id, user.schoolId))
      .limit(1);
    const [cls] = await this.db
      .select({ nameBn: academicClasses.nameBn })
      .from(academicClasses)
      .where(eq(academicClasses.id, exam.classId))
      .limit(1);
    const subjectRows = await this.db
      .select({
        code: subjects.code,
        nameBn: subjects.nameBn,
        orderIndex: subjects.orderIndex,
      })
      .from(examSubjects)
      .innerJoin(subjects, eq(subjects.id, examSubjects.subjectId))
      .where(eq(examSubjects.examId, examId))
      .orderBy(asc(subjects.orderIndex));
    const studentRows = await this.db
      .select({
        id: students.id,
        nameBn: users.displayNameBn,
        nameEn: students.nameEn,
        registrationNumber: users.registrationNumber,
        roll: students.roll,
        sectionId: students.sectionId,
        sectionNameBn: sections.nameBn,
        groupName: sections.groupName,
        photoUrl: students.photoUrl,
        fatherNameBn: students.fatherNameBn,
      })
      .from(students)
      .innerJoin(users, eq(users.id, students.userId))
      .leftJoin(sections, eq(sections.id, students.sectionId))
      .where(
        and(
          eq(students.schoolId, user.schoolId),
          eq(students.classId, exam.classId),
        ),
      )
      .orderBy(asc(sections.nameBn), asc(students.roll));
    return {
      data: {
        school,
        exam: {
          id: exam.id,
          nameBn: exam.nameBn,
          startsAt: exam.startsAt,
          endsAt: exam.endsAt,
        },
        classNameBn: cls?.nameBn ?? '',
        subjects: subjectRows,
        students: studentRows,
      },
    };
  }

  async publish(
    user: AuthUser,
    examId: string,
    value: { publishAt?: string; countdownEnabled?: boolean },
  ) {
    // B10: a publish date before the exam ends is rejected here too —
    // this is the exact flow that produced the live Nov-20/Dec-15 clash.
    if (value.publishAt) {
      const [exam] = await this.db
        .select({ endsAt: exams.endsAt })
        .from(exams)
        .where(and(eq(exams.id, examId), eq(exams.schoolId, user.schoolId)))
        .limit(1);
      if (!exam) throw new NotFoundException('পরীক্ষা পাওয়া যায়নি');
      const error = examScheduleError({
        endsAt: exam.endsAt,
        publishAt: value.publishAt,
      });
      if (error) throw new BadRequestException(error);
    }
    const [row] = await this.db
      .update(exams)
      .set({
        // A scheduled publish keeps isPublished=true and lets the future
        // publishAt gate visibility: every read path checks
        // "isPublished AND (publishAt IS NULL OR publishAt <= now)", and
        // examVisibility() reports such an exam as "scheduled" — so the
        // result appears automatically when the time arrives, and the
        // public countdown can see the exam in the meantime.
        isPublished: true,
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
    const error = examScheduleError({
      endsAt: value.endsAt as string | undefined,
      publishAt: value.publishAt as string | undefined,
    });
    if (error) throw new BadRequestException(error);
    const [row] = await this.db
      .insert(exams)
      .values({ ...value, schoolId: user.schoolId } as never)
      .returning();
    return { data: row };
  }
  /** B10/B12: exam update (dates included) with the same sanity rule. */
  async updateExam(
    user: AuthUser,
    id: string,
    value: Record<string, unknown>,
  ) {
    const [existing] = await this.db
      .select()
      .from(exams)
      .where(and(eq(exams.id, id), eq(exams.schoolId, user.schoolId)))
      .limit(1);
    if (!existing) throw new NotFoundException('পরীক্ষা পাওয়া যায়নি');
    const { schoolId: _ignored, id: _ignoredId, ...fields } = value;
    const merged = { ...existing, ...fields } as {
      endsAt?: string | null;
      publishAt?: string | Date | null;
    };
    const error = examScheduleError({
      endsAt: merged.endsAt,
      publishAt: merged.publishAt,
    });
    if (error) throw new BadRequestException(error);
    const [row] = await this.db
      .update(exams)
      .set({ ...fields, updatedAt: new Date() } as never)
      .where(and(eq(exams.id, id), eq(exams.schoolId, user.schoolId)))
      .returning();
    return { data: row };
  }
  /** B12: delete an exam — refused while it has marks or results. */
  async removeExam(user: AuthUser, id: string) {
    const [exam] = await this.db
      .select()
      .from(exams)
      .where(and(eq(exams.id, id), eq(exams.schoolId, user.schoolId)))
      .limit(1);
    if (!exam) throw new NotFoundException('পরীক্ষা পাওয়া যায়নি');
    const [resultRow] = await this.db
      .select({ id: results.id })
      .from(results)
      .where(eq(results.examId, id))
      .limit(1);
    const configs = await this.db
      .select({ id: examSubjects.id })
      .from(examSubjects)
      .where(eq(examSubjects.examId, id));
    if (resultRow)
      throw new BadRequestException(
        'এই পরীক্ষার ফলাফল তৈরি হয়েছে, তাই মোছা যাবে না',
      );
    if (configs.length) {
      const markRows = await this.db
        .select({ id: marks.id })
        .from(marks)
        .where(
          inArray(
            marks.examSubjectId,
            configs.map((row) => row.id),
          ),
        )
        .limit(1);
      if (markRows.length)
        throw new BadRequestException(
          'এই পরীক্ষায় নম্বর এন্ট্রি হয়েছে, তাই মোছা যাবে না',
        );
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(examSubjects).where(eq(examSubjects.examId, id));
      await tx
        .delete(exams)
        .where(and(eq(exams.id, id), eq(exams.schoolId, user.schoolId)));
    });
    return { data: { id } };
  }
  /** B12: delete one grading-scale row of the caller's school. */
  async removeScale(user: AuthUser, id: string) {
    const [row] = await this.db
      .delete(gradingScales)
      .where(
        and(
          eq(gradingScales.id, id),
          eq(gradingScales.schoolId, user.schoolId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundException('গ্রেডিং স্কেল পাওয়া যায়নি');
    return { data: { id } };
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
    const pairBySubject = new Map<string, string | null>();
    if (configurations.length) {
      const subjectRows = await this.db
        .select({ id: subjects.id, pairSubjectId: subjects.pairSubjectId })
        .from(subjects)
        .where(
          inArray(
            subjects.id,
            configurations.map((configuration) => configuration.subjectId),
          ),
        );
      for (const row of subjectRows) pairBySubject.set(row.id, row.pairSubjectId);
    }
    const configuredSubjectIds = new Set(
      configurations.map((configuration) => configuration.subjectId),
    );
    const groupKeys = configurations.map((configuration) => {
      const pairId = pairBySubject.get(configuration.subjectId);
      return pairId && configuredSubjectIds.has(pairId)
        ? [configuration.subjectId, pairId].sort().join(':')
        : undefined;
    });
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
      for (const [configIndex, configuration] of configurations.entries()) {
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
          fullMarks: configuration.fullMarks,
          groupKey: groupKeys[configIndex],
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
  /** Public exam list: published + scheduled exams only (never hidden). */
  async publicExams(schoolId: string) {
    const now = new Date();
    const rows = await this.db
      .select({
        id: exams.id,
        nameBn: exams.nameBn,
        classId: exams.classId,
        classNameBn: academicClasses.nameBn,
        sessionYear: academicSessions.year,
        publishAt: exams.publishAt,
        isPublished: exams.isPublished,
      })
      .from(exams)
      .innerJoin(academicSessions, eq(exams.sessionId, academicSessions.id))
      .leftJoin(academicClasses, eq(exams.classId, academicClasses.id))
      .where(eq(exams.schoolId, schoolId))
      .orderBy(asc(exams.createdAt));
    return {
      data: rows.flatMap((row) => {
        const status = examVisibility(row, now);
        if (status === 'hidden') return [];
        return [
          {
            id: row.id,
            nameBn: row.nameBn,
            sessionYear: row.sessionYear,
            classId: row.classId,
            classNameBn: row.classNameBn,
            publishAt: row.publishAt,
            status,
          },
        ];
      }),
    };
  }

  /**
   * Class-wise published results. Without an examId the most recent
   * published exam is used. Rows are only ever returned while the exam
   * is publicly visible (published and publishAt reached).
   */
  async publicList(schoolId: string, examId?: string, classId?: string) {
    let targetExamId = examId;
    if (!targetExamId) {
      const [latest] = await this.db
        .select({ id: exams.id })
        .from(exams)
        .where(
          and(
            eq(exams.schoolId, schoolId),
            eq(exams.isPublished, true),
            or(isNull(exams.publishAt), lte(exams.publishAt, new Date())),
          ),
        )
        .orderBy(desc(exams.createdAt))
        .limit(1);
      if (!latest) return { data: [], examId: null };
      targetExamId = latest.id;
    }
    const conditions = [
      eq(results.schoolId, schoolId),
      eq(results.examId, targetExamId),
      eq(exams.isPublished, true),
      or(isNull(exams.publishAt), lte(exams.publishAt, new Date())),
    ];
    if (classId) conditions.push(eq(results.classId, classId));
    const rows = await this.db
      .select({
        registrationNumber: users.registrationNumber,
        nameBn: users.displayNameBn,
        classId: results.classId,
        totalMarks: results.totalMarks,
        gpa: results.gpa,
        letter: results.letter,
        meritPosition: results.meritPosition,
        isPassed: results.isPassed,
      })
      .from(results)
      .innerJoin(exams, eq(results.examId, exams.id))
      .innerJoin(students, eq(results.studentId, students.id))
      .innerJoin(users, eq(students.userId, users.id))
      .where(and(...conditions))
      .orderBy(asc(results.meritPosition), desc(results.totalMarks));
    const totalsByClass = new Map<string, number[]>();
    for (const row of rows) {
      const current = totalsByClass.get(row.classId ?? '') ?? [];
      current.push(row.totalMarks);
      totalsByClass.set(row.classId ?? '', current);
    }
    return {
      data: rows.map((row) => ({
        ...row,
        meritPosition: denseRankByTotal(
          (totalsByClass.get(row.classId ?? '') ?? []).map((totalMarks) => ({
            totalMarks,
          })),
          { totalMarks: row.totalMarks },
        ),
      })),
      examId: targetExamId,
    };
  }

  async publicSearch(
    schoolId: string,
    registrationNumber: string,
    examId?: string,
  ) {
    const student = await this.db
      .select({
        id: students.id,
        registrationNumber: users.registrationNumber,
        nameBn: users.displayNameBn,
        nameEn: students.nameEn,
        classId: students.classId,
        classNameBn: academicClasses.nameBn,
        sectionNameBn: sections.nameBn,
        roll: students.roll,
      })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .leftJoin(academicClasses, eq(students.classId, academicClasses.id))
      .leftJoin(sections, eq(students.sectionId, sections.id))
      .where(
        and(
          eq(students.schoolId, schoolId),
          eq(users.registrationNumber, registrationNumber),
        ),
      )
      .limit(1);
    // B1 contract: distinguish "no such student" from "student exists
    // but has no published result yet" — the portal used to show the
    // same "কোনো ফলাফল পাওয়া যায়নি" for both.
    if (!student[0]) return { data: null, status: 'STUDENT_NOT_FOUND' };
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
    if (!rows[0]) return { data: null, status: 'NO_PUBLISHED_RESULT' };

    const resultRow = rows[0];
    const classResults = await this.db
      .select({ result: results })
      .from(results)
      .innerJoin(exams, eq(results.examId, exams.id))
      .where(
        and(
          eq(results.schoolId, schoolId),
          eq(results.examId, resultRow.result.examId),
          eq(results.classId, resultRow.result.classId),
          eq(exams.isPublished, true),
          or(isNull(exams.publishAt), lte(exams.publishAt, new Date())),
        ),
      );
    const meritPosition = denseRankByTotal(
      classResults.map((row) => ({ totalMarks: row.result.totalMarks })),
      { totalMarks: resultRow.result.totalMarks },
    );
    const subjectRows = await this.db
      .select({
        code: subjects.code,
        subjectNameBn: subjects.nameBn,
        fullMarks: examSubjects.fullMarks,
        obtainedMarks: resultSubjects.totalMarks,
        grade: resultSubjects.letter,
        gradePoint: resultSubjects.gpa,
        cq: marks.cq,
        mcq: marks.mcq,
        practical: marks.practical,
        cqMarks: examSubjects.cqMarks,
        mcqMarks: examSubjects.mcqMarks,
        practicalMarks: examSubjects.practicalMarks,
        isAbsent: resultSubjects.isAbsent,
      })
      .from(resultSubjects)
      .innerJoin(
        examSubjects,
        eq(resultSubjects.examSubjectId, examSubjects.id),
      )
      .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
      .leftJoin(
        marks,
        and(
          eq(marks.examSubjectId, resultSubjects.examSubjectId),
          eq(marks.studentId, resultRow.result.studentId),
        ),
      )
      .where(eq(resultSubjects.resultId, resultRow.result.id));

    return {
      data: {
        result: { ...resultRow.result, meritPosition },
        exam: resultRow.exam,
        student: {
          nameBn: student[0].nameBn,
          nameEn: student[0].nameEn,
          registrationNumber: student[0].registrationNumber,
          classNameBn: student[0].classNameBn,
          sectionNameBn: student[0].sectionNameBn,
          roll: student[0].roll,
        },
        subjects: subjectRows.map((subject) => ({
          ...subject,
          subjectNameEn: null,
        })),
      },
      status: 'FOUND',
    };
  }
  async student(user: AuthUser, examId?: string) {
    // B1: resolve via the student row and query with ITS school.
    const own = await resolveOwnStudent(this.db, user);
    if (!own) return { data: [] };
    const data = await this.resultsForStudent(
      own.schoolId,
      own.student.id,
      true,
      examId,
    );
    return { data };
  }

  /**
   * ADMIN per-student results for the student-profile "ফলাফল" tab
   * (Round 9). Mirrors the student-portal read but takes an explicit
   * studentId — accepted only after the same school-ownership check the
   * Round-8 fee statement uses — and skips the publish gate, because the
   * admin processes results before publishing them (the exam row carries
   * isPublished/publishAt so the UI can badge unpublished results).
   */
  async studentResults(user: AuthUser, studentId: string) {
    const [student] = await this.db
      .select({ id: students.id })
      .from(students)
      .where(
        and(eq(students.id, studentId), eq(students.schoolId, user.schoolId)),
      )
      .limit(1);
    if (!student) throw new NotFoundException('শিক্ষার্থী পাওয়া যায়নি');
    const data = await this.resultsForStudent(user.schoolId, studentId, false);
    return { data };
  }

  /**
   * Shared assembler: every processed result of one student, each with
   * its subject-wise marksheet rows (configured maxima from exam_subjects,
   * obtained CQ/MCQ/Practical from marks). `publishedOnly` applies the
   * public-visibility gate used by the student portal.
   */
  private async resultsForStudent(
    schoolId: string,
    studentId: string,
    publishedOnly: boolean,
    examId?: string,
  ) {
    const conditions = [
      eq(results.schoolId, schoolId),
      eq(results.studentId, studentId),
      ...(publishedOnly
        ? [
            eq(exams.isPublished, true),
            or(isNull(exams.publishAt), lte(exams.publishAt, new Date())),
          ]
        : []),
      ...(examId ? [eq(results.examId, examId)] : []),
    ];
    const rows = await this.db
      .select({
        result: results,
        exam: exams,
        sessionName: academicSessions.name,
      })
      .from(results)
      .innerJoin(exams, eq(results.examId, exams.id))
      .innerJoin(students, eq(results.studentId, students.id))
      .innerJoin(academicSessions, eq(exams.sessionId, academicSessions.id))
      .where(and(...conditions));
    const data = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        subjects: await this.db
          .select({
            code: subjects.code,
            nameBn: subjects.nameBn,
            totalMarks: resultSubjects.totalMarks,
            letter: resultSubjects.letter,
            gpa: resultSubjects.gpa,
            isAbsent: resultSubjects.isAbsent,
            // Marksheet splits: the exam's configured component maxima come
            // from exam_subjects; the student's obtained CQ/MCQ/Practical
            // come from marks (left join — a processed result can exist
            // even where a mark row was never entered).
            fullMarks: examSubjects.fullMarks,
            passMarks: examSubjects.passMarks,
            cqMarks: examSubjects.cqMarks,
            mcqMarks: examSubjects.mcqMarks,
            practicalMarks: examSubjects.practicalMarks,
            cq: marks.cq,
            mcq: marks.mcq,
            practical: marks.practical,
          })
          .from(resultSubjects)
          .innerJoin(
            examSubjects,
            eq(resultSubjects.examSubjectId, examSubjects.id),
          )
          .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
          .leftJoin(
            marks,
            and(
              eq(marks.examSubjectId, resultSubjects.examSubjectId),
              eq(marks.studentId, row.result.studentId),
            ),
          )
          .where(eq(resultSubjects.resultId, row.result.id)),
      })),
    );
    return data;
  }
}
