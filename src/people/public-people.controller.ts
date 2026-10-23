import { Controller, Get, Query } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  sections,
  students,
  subjectAssignments,
  subjects,
  teachers,
  users,
} from '../db/schema.js';

function schoolIdOf(schoolId?: string) {
  return schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '';
}

@Controller('public/teachers')
export class PublicTeachersController {
  private readonly db = createDb();

  @Get() async list(@Query('schoolId') schoolId?: string) {
    const school = schoolIdOf(schoolId);
    const rows = await this.db
      .select({
        id: teachers.id,
        nameBn: users.displayNameBn,
        designationBn: teachers.designation,
        photoUrl: teachers.photoUrl,
        qualificationBn: teachers.qualification,
        joiningDate: teachers.joiningDate,
        teacherCode: teachers.teacherCode,
      })
      .from(teachers)
      .innerJoin(users, eq(teachers.userId, users.id))
      .where(and(eq(teachers.schoolId, school), eq(users.isActive, true)))
      .orderBy(asc(teachers.joiningDate), asc(teachers.teacherCode));
    const assignments = rows.length
      ? await this.db
          .select({
            teacherId: subjectAssignments.teacherId,
            subjectNameBn: subjects.nameBn,
          })
          .from(subjectAssignments)
          .innerJoin(subjects, eq(subjectAssignments.subjectId, subjects.id))
          .where(
            inArray(
              subjectAssignments.teacherId,
              rows.map((row) => row.id),
            ),
          )
      : [];
    const subjectsByTeacher = new Map<string, string[]>();
    for (const assignment of assignments) {
      const list = subjectsByTeacher.get(assignment.teacherId) ?? [];
      if (!list.includes(assignment.subjectNameBn))
        list.push(assignment.subjectNameBn);
      subjectsByTeacher.set(assignment.teacherId, list);
    }
    return {
      data: rows.map((row, index) => ({
        id: row.id,
        nameBn: row.nameBn,
        designationBn: row.designationBn,
        subjectBn: (subjectsByTeacher.get(row.id) ?? []).join(', '),
        photoUrl: row.photoUrl,
        qualificationBn: row.qualificationBn,
        joiningOrder: index + 1,
      })),
    };
  }
}

@Controller('public/students')
export class PublicStudentsController {
  private readonly db = createDb();

  @Get() async list(
    @Query('schoolId') schoolId?: string,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
  ) {
    const school = schoolIdOf(schoolId);
    const conditions = [
      eq(students.schoolId, school),
      eq(students.isActive, true),
      eq(users.isActive, true),
    ];
    if (classId) conditions.push(eq(students.classId, classId));
    if (sectionId) conditions.push(eq(students.sectionId, sectionId));
    const rows = await this.db
      .select({
        id: students.id,
        nameBn: users.displayNameBn,
        classId: students.classId,
        classBn: academicClasses.nameBn,
        sectionId: students.sectionId,
        sectionBn: sections.nameBn,
        roll: students.roll,
        registrationNumber: users.registrationNumber,
      })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .leftJoin(academicClasses, eq(students.classId, academicClasses.id))
      .leftJoin(sections, eq(students.sectionId, sections.id))
      .where(and(...conditions))
      .orderBy(
        asc(academicClasses.orderIndex),
        asc(sections.nameBn),
        asc(students.roll),
      );
    const counts = new Map<
      string,
      { classId: string | null; classBn: string | null; count: number }
    >();
    for (const row of rows) {
      const key = row.classId ?? 'none';
      const entry = counts.get(key) ?? {
        classId: row.classId,
        classBn: row.classBn,
        count: 0,
      };
      entry.count += 1;
      counts.set(key, entry);
    }
    return { data: rows, counts: [...counts.values()] };
  }
}
