import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as argon2 from 'argon2';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createDb } from '../src/db/index.js';
import {
  academicClasses,
  academicSessions,
  admissionApplications,
  admissionSettings,
  attendance,
  banners,
  committee,
  downloads,
  events,
  examSubjects,
  exams,
  feeEventClasses,
  feeEvents,
  galleries,
  galleryItems,
  gradingScales,
  holidays,
  homepageBlocks,
  importantLinks,
  ledgerEntries,
  marks,
  menuItems,
  menus,
  news,
  notices,
  pages,
  payments,
  receipts,
  resultSubjects,
  results,
  routineEntries,
  sections,
  schools,
  salaryRecords,
  serviceBoxes,
  serviceBoxLinks,
  settings,
  studentFees,
  students,
  subjectAssignments,
  subjects,
  teachers,
  users,
  videos,
} from '../src/db/schema.js';
import {
  processStudentResult,
  type GradeScale,
} from '../src/results/processing.js';

if (existsSync(resolve(process.cwd(), '.env')))
  process.loadEnvFile(resolve(process.cwd(), '.env'));

type Credentials = {
  admin: { identifier: string; password: string };
  teacher: { identifier: string; password: string };
  students: string[];
};
type SeedDb = ReturnType<typeof createDb>;
const credentialsPath = resolve(process.cwd(), '.demo-credentials.json');
const fixedUuid = (number: number) =>
  `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

function credentials(): Credentials {
  if (existsSync(credentialsPath))
    return JSON.parse(readFileSync(credentialsPath, 'utf8')) as Credentials;
  const value: Credentials = {
    admin: {
      identifier: 'demo-admin',
      password: randomBytes(18).toString('base64url'),
    },
    teacher: {
      identifier: 'demo-teacher',
      password: randomBytes(18).toString('base64url'),
    },
    students: ['26100001', '26100002', '26100003', '26100004', '26100005'],
  };
  writeFileSync(credentialsPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  return value;
}

function progress(label: string, count: number) {
  console.log(`[seed] ${label}: ${count}`);
}

async function seed(db: SeedDb) {
  const login = credentials();
  const [school] = await db
    .insert(schools)
    .values({
      nameBn: 'আদর্শ মডেল উচ্চ বিদ্যালয়',
      nameEn: 'Adarsha Model High School',
      eiin: '123456',
      address: 'কুড়িগ্রাম সদর, কুড়িগ্রাম',
      foundedYear: '1985',
      themeColor: '#21699D',
      phone: '01700000000',
      email: 'info@adarshamodel.edu.bd',
    })
    .onConflictDoUpdate({
      target: schools.eiin,
      set: {
        nameBn: 'আদর্শ মডেল উচ্চ বিদ্যালয়',
        nameEn: 'Adarsha Model High School',
        address: 'কুড়িগ্রাম সদর, কুড়িগ্রাম',
        foundedYear: '1985',
        themeColor: '#21699D',
        phone: '01700000000',
        email: 'info@adarshamodel.edu.bd',
        updatedAt: new Date(),
      },
    })
    .returning({ id: schools.id });
  if (!school) throw new Error('Demo school was not created');
  progress('school', 1);

  const studentRegistrations = [
    ...login.students,
    ...Array.from({ length: 115 }, (_, index) => {
      const classNumber = 6 + Math.floor(index / 23);
      return `26${String(classNumber).padStart(2, '0')}${String(index + 6).padStart(4, '0')}`;
    }),
  ];
  const passwordRows = [
    {
      schoolId: school.id,
      role: 'ADMIN' as const,
      username: login.admin.identifier,
      email: 'demo-admin@adarsha.test',
      passwordHash: await argon2.hash(login.admin.password),
      displayNameBn: 'ডেমো প্রশাসক',
    },
    {
      schoolId: school.id,
      role: 'TEACHER' as const,
      username: login.teacher.identifier,
      email: 'demo-teacher@adarsha.test',
      passwordHash: await argon2.hash(login.teacher.password),
      displayNameBn: 'ডেমো শিক্ষক',
    },
    {
      schoolId: school.id,
      role: 'TEACHER' as const,
      username: 'demo-teacher-2',
      email: 'demo-teacher-2@adarsha.test',
      passwordHash: await argon2.hash('DemoTeacher2!2026'),
      displayNameBn: 'ডেমো শিক্ষক ২',
    },
    {
      schoolId: school.id,
      role: 'TEACHER' as const,
      username: 'demo-teacher-3',
      email: 'demo-teacher-3@adarsha.test',
      passwordHash: await argon2.hash('DemoTeacher3!2026'),
      displayNameBn: 'ডেমো শিক্ষক ৩',
    },
  ];
  passwordRows.push(
    ...(await Promise.all(
      Array.from({ length: 9 }, async (_, index) => ({
        schoolId: school.id,
        role: 'TEACHER' as const,
        username: `demo-teacher-${index + 4}`,
        email: `demo-teacher-${index + 4}@adarsha.test`,
        passwordHash: await argon2.hash(`DemoTeacher${index + 4}!2026`),
        displayNameBn: `ডেমো শিক্ষক ${index + 4}`,
      })),
    )),
  );
  // The ignored credentials file is the source of truth for demo logins. Updating
  // these fields on conflict keeps repeated seeds idempotent and prevents an old
  // password hash from drifting away from the credentials file.
  await db
    .insert(users)
    .values(passwordRows)
    .onConflictDoUpdate({
      target: [users.schoolId, users.email],
      set: {
        username: sql`excluded.username`,
        passwordHash: sql`excluded.password_hash`,
        displayNameBn: sql`excluded.display_name_bn`,
        isActive: sql`excluded.is_active`,
        updatedAt: new Date(),
      },
    });
  const studentAccounts = studentRegistrations.map(
    (registrationNumber, index) => ({
      schoolId: school.id,
      role: 'STUDENT' as const,
      registrationNumber,
      displayNameBn:
        [
          'আরিফুল ইসলাম',
          'সুমাইয়া আক্তার',
          'রাকিব হাসান',
          'মিম আক্তার',
          'তানভীর আহমেদ',
        ][index] ?? `ডেমো শিক্ষার্থী ${index + 1}`,
    }),
  );
  await db
    .insert(users)
    .values(studentAccounts)
    .onConflictDoUpdate({
      target: users.registrationNumber,
      set: { isActive: true, updatedAt: new Date() },
    });
  progress('users', passwordRows.length + studentAccounts.length);

  const sessionId = fixedUuid(1);
  await db
    .insert(academicSessions)
    .values({
      id: sessionId,
      schoolId: school.id,
      name: '২০২৬ শিক্ষাবর্ষ',
      year: 2026,
      isCurrent: true,
    })
    .onConflictDoUpdate({
      target: [academicSessions.schoolId, academicSessions.year],
      set: { isCurrent: true, updatedAt: new Date() },
    });
  const classValues = Array.from({ length: 5 }, (_, index) => {
    const number = index + 6;
    return {
      id: fixedUuid(100 + number),
      schoolId: school.id,
      nameBn: `শ্রেণি ${number}`,
      nameEn: `Class ${number}`,
      orderIndex: index + 1,
    };
  });
  await db.insert(academicClasses).values(classValues).onConflictDoNothing();
  const sectionValues = classValues.flatMap((classRow) =>
    ['ক', 'খ'].map((suffix, index) => ({
      id: fixedUuid(2000 + (classRow.orderIndex + 5) * 10 + index + 1),
      schoolId: school.id,
      classId: classRow.id,
      nameBn: `শাখা ${suffix}`,
      shift: 'দিন',
      groupName: 'সাধারণ',
    })),
  );
  await db.insert(sections).values(sectionValues).onConflictDoNothing();
  progress('academic classes', classValues.length);
  progress('sections', sectionValues.length);

  const subjectValues = [
    'বাংলা',
    'ইংরেজি',
    'গণিত',
    'বিজ্ঞান',
    'বাংলাদেশ ও বিশ্বপরিচয়',
  ].map((nameBn, index) => ({
    id: fixedUuid(301 + index),
    schoolId: school.id,
    nameBn,
    code: `S${index + 1}`,
    fullMarks: 100,
    cqMarks: 70,
    mcqMarks: 30,
    orderIndex: index,
  }));
  await db.insert(subjects).values(subjectValues).onConflictDoNothing();
  progress('subjects', subjectValues.length);

  const teacherEmails = [
    'demo-teacher@adarsha.test',
    ...Array.from(
      { length: 11 },
      (_, index) => `demo-teacher-${index + 2}@adarsha.test`,
    ),
  ];
  const teacherAccounts = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.schoolId, school.id), eq(users.role, 'TEACHER')));
  const teacherValues = teacherEmails.map((email, index) => ({
    id: fixedUuid(500 + index),
    schoolId: school.id,
    userId:
      teacherAccounts.find((account) => account.email === email)?.id ??
      fixedUuid(900 + index),
    teacherCode: `T-${String(index + 1).padStart(3, '0')}`,
    designation:
      index === 0
        ? 'প্রধান শিক্ষক'
        : index === 1
          ? 'সহকারী প্রধান শিক্ষক'
          : 'সহকারী শিক্ষক',
    qualification: index < 2 ? 'স্নাতকোত্তর' : 'স্নাতক',
    mobile: `0170000000${index}`,
    joiningDate: '2020-01-01',
    monthlySalary: 2500000,
    photoUrl: 'https://placehold.co/240x240/21699D/FFFFFF?text=Teacher',
  }));
  await db
    .insert(teachers)
    .values(teacherValues)
    .onConflictDoUpdate({
      target: [teachers.schoolId, teachers.teacherCode],
      set: {
        designation: sql`excluded.designation`,
        qualification: sql`excluded.qualification`,
        photoUrl: sql`excluded.photo_url`,
        updatedAt: new Date(),
      },
    });
  const savedTeachers = await db
    .select({ id: teachers.id, teacherCode: teachers.teacherCode })
    .from(teachers)
    .where(eq(teachers.schoolId, school.id));
  progress('teachers', savedTeachers.length);

  const assignmentValues = savedTeachers.flatMap((teacher, teacherIndex) =>
    classValues.map((classRow) => ({
      id: fixedUuid(4000 + teacherIndex * 10 + classRow.orderIndex),
      schoolId: school.id,
      teacherId: teacher.id,
      subjectId: subjectValues[teacherIndex % subjectValues.length]!.id,
      classId: classRow.id,
      sectionId: sectionValues.find(
        (section) => section.classId === classRow.id,
      )?.id,
    })),
  );
  await db
    .insert(subjectAssignments)
    .values(assignmentValues)
    .onConflictDoNothing();
  progress('subject assignments', assignmentValues.length);
  const routineValues = assignmentValues
    .slice(0, 25)
    .map((assignment, index) => ({
      id: fixedUuid(12000 + index),
      schoolId: school.id,
      teacherId: assignment.teacherId,
      subjectId: assignment.subjectId,
      classId: assignment.classId,
      sectionId: assignment.sectionId,
      dayOfWeek: index % 5,
      period: (index % 6) + 1,
      room: `কক্ষ ${101 + (index % 8)}`,
    }));
  await db.insert(routineEntries).values(routineValues).onConflictDoNothing();
  progress('routine slots', routineValues.length);

  const selectedStudentAccounts = await db
    .select({ id: users.id, registrationNumber: users.registrationNumber })
    .from(users)
    .where(and(eq(users.schoolId, school.id), eq(users.role, 'STUDENT')));
  const studentValues = selectedStudentAccounts
    .slice(0, studentRegistrations.length)
    .map((account, index) => {
      const registrationNumber =
        account.registrationNumber ?? studentRegistrations[index]!;
      const classNumber = Number(registrationNumber.slice(2, 4));
      const classRow =
        classValues.find(
          (row) => Number(row.nameEn.slice(-2)) === classNumber,
        ) ?? classValues[index % classValues.length]!;
      const section = sectionValues.filter(
        (row) => row.classId === classRow.id,
      )[index % 2]!;
      return {
        schoolId: school.id,
        userId: account.id,
        sessionId,
        classId: classRow.id,
        sectionId: section.id,
        roll: (index % 6) + 1,
        nameEn: `Demo Student ${index + 1}`,
        fatherNameBn: 'ডেমো পিতা',
        motherNameBn: 'ডেমো মাতা',
        guardianMobile: '01700000000',
        admissionDate: '2026-01-01',
      };
    });
  await db.insert(students).values(studentValues).onConflictDoNothing();
  const savedStudents = await db
    .select({
      id: students.id,
      classId: students.classId,
      sectionId: students.sectionId,
    })
    .from(students)
    .where(eq(students.schoolId, school.id));
  progress('students', savedStudents.length);

  const scaleValues = [
    { minMarks: 0, maxMarks: 32, letter: 'F', gpa: '0.00', orderIndex: 0 },
    { minMarks: 33, maxMarks: 39, letter: 'D', gpa: '1.00', orderIndex: 1 },
    { minMarks: 40, maxMarks: 49, letter: 'C', gpa: '2.00', orderIndex: 2 },
    { minMarks: 50, maxMarks: 59, letter: 'B', gpa: '3.00', orderIndex: 3 },
    { minMarks: 60, maxMarks: 69, letter: 'A-', gpa: '3.50', orderIndex: 4 },
    { minMarks: 70, maxMarks: 79, letter: 'A', gpa: '4.00', orderIndex: 5 },
    { minMarks: 80, maxMarks: 100, letter: 'A+', gpa: '5.00', orderIndex: 6 },
  ];
  await db
    .insert(gradingScales)
    .values(
      scaleValues.map((row, index) => ({
        ...row,
        id: fixedUuid(8000 + index),
        schoolId: school.id,
      })),
    )
    .onConflictDoNothing();
  const gradeScale: GradeScale[] = scaleValues.map((row) => ({
    ...row,
    gpa: Number(row.gpa),
  }));
  const examValues = classValues.flatMap((classRow) => [
    {
      id: fixedUuid(6000 + classRow.orderIndex),
      schoolId: school.id,
      sessionId,
      classId: classRow.id,
      nameBn: 'অর্ধ-বার্ষিক',
      examType: 'half-yearly',
      startsAt: '2026-10-01',
      endsAt: '2026-10-15',
      isPublished: true,
      countdownEnabled: false,
      failAnySubject: true,
    },
    {
      id: fixedUuid(6100 + classRow.orderIndex),
      schoolId: school.id,
      sessionId,
      classId: classRow.id,
      nameBn: 'বার্ষিক পরীক্ষা',
      examType: 'annual',
      startsAt: '2026-12-01',
      endsAt: '2026-12-15',
      isPublished: false,
      publishAt: new Date('2026-11-20T00:00:00.000Z'),
      countdownEnabled: true,
      failAnySubject: true,
    },
  ]);
  await db.insert(exams).values(examValues).onConflictDoNothing();
  const examSubjectValues = examValues.flatMap((exam) =>
    subjectValues.map((subject, index) => ({
      id: fixedUuid(7000 + examValues.indexOf(exam) * 10 + index),
      examId: exam.id,
      subjectId: subject.id,
      fullMarks: 100,
      passMarks: 33,
      cqMarks: 70,
      mcqMarks: 30,
      practicalMarks: 0,
    })),
  );
  await db.insert(examSubjects).values(examSubjectValues).onConflictDoNothing();
  const markValues = examValues.flatMap((exam, examIndex) =>
    savedStudents
      .filter((student) => student.classId === exam.classId)
      .flatMap((student, studentIndex) =>
        examSubjectValues
          .filter((configuration) => configuration.examId === exam.id)
          .map((configuration, subjectIndex) => {
            const isFailCase = studentIndex === 1 && subjectIndex === 0;
            const isBoundary = studentIndex === 2 && subjectIndex === 0;
            const total = isFailCase
              ? 20
              : isBoundary
                ? 80
                : studentIndex === 0
                  ? 90
                  : 75;
            return {
              id: fixedUuid(
                10000 + examIndex * 10000 + studentIndex * 10 + subjectIndex,
              ),
              schoolId: school.id,
              examSubjectId: configuration.id,
              studentId: student.id,
              cq: Math.min(total, 70),
              mcq: Math.max(total - 70, 0),
              practical: 0,
              total,
              isAbsent: false,
              isSubmitted: true,
              isLocked: true,
            };
          }),
      ),
  );
  await db.insert(marks).values(markValues).onConflictDoNothing();
  const oldResults = await db
    .select({ id: results.id })
    .from(results)
    .where(
      and(
        eq(results.schoolId, school.id),
        inArray(
          results.examId,
          examValues.map((exam) => exam.id),
        ),
      ),
    );
  if (oldResults.length) {
    await db.delete(resultSubjects).where(
      inArray(
        resultSubjects.resultId,
        oldResults.map((row) => row.id),
      ),
    );
    await db.delete(results).where(
      inArray(
        results.id,
        oldResults.map((row) => row.id),
      ),
    );
  }
  const resultValues: Array<typeof results.$inferInsert> = [];
  const resultSubjectValues: Array<typeof resultSubjects.$inferInsert> = [];
  for (const exam of examValues) {
    const configurations = examSubjectValues.filter(
      (configuration) => configuration.examId === exam.id,
    );
    for (const student of savedStudents.filter(
      (row) => row.classId === exam.classId,
    )) {
      const studentMarks = configurations.map((configuration) => {
        const mark = markValues.find(
          (row) =>
            row.examSubjectId === configuration.id &&
            row.studentId === student.id,
        );
        return {
          total: mark?.total ?? 0,
          passMarks: configuration.passMarks,
          isAbsent: mark?.isAbsent ?? false,
        };
      });
      const processed = processStudentResult(studentMarks, gradeScale, true);
      const resultId = fixedUuid(12000 + resultValues.length);
      resultValues.push({
        id: resultId,
        schoolId: school.id,
        examId: exam.id,
        studentId: student.id,
        classId: exam.classId,
        totalMarks: processed.total,
        gpa: processed.gpa.toFixed(2),
        letter: processed.letter,
        isPassed: processed.isPassed,
        meritPosition: 0,
      });
      processed.subjects.forEach((subject, index) =>
        resultSubjectValues.push({
          id: fixedUuid(13000 + resultSubjectValues.length),
          resultId,
          examSubjectId: configurations[index]!.id,
          totalMarks: subject.total,
          letter: subject.letter,
          gpa: subject.gpa.toFixed(2),
          isAbsent: subject.isAbsent ?? false,
        }),
      );
    }
  }
  await db.insert(results).values(resultValues).onConflictDoNothing();
  await db
    .insert(resultSubjects)
    .values(resultSubjectValues)
    .onConflictDoNothing();
  progress('exams and processed results', resultValues.length);

  const markedBy = teacherAccounts[0]?.id;
  if (!markedBy) throw new Error('Demo teacher account was not created');
  const attendanceValues = Array.from({ length: 7 }, (_, dayOffset) => {
    const date = new Date(Date.UTC(2026, 9, 1 + dayOffset))
      .toISOString()
      .slice(0, 10);
    return savedStudents.map((student, index) => ({
      schoolId: school.id,
      studentId: student.id,
      sessionId,
      classId: student.classId!,
      sectionId: student.sectionId,
      attendanceDate: date,
      status: (index + dayOffset) % 13 === 0 ? 'ABSENT' : 'PRESENT',
      markedBy,
    }));
  }).flat();
  await db.insert(attendance).values(attendanceValues).onConflictDoNothing();
  progress('attendance rows', attendanceValues.length);

  const homepageDefaults = {
    blocks: [
      'header',
      'menu',
      'ticker',
      'banner',
      'about',
      'statistics',
      'services',
      'messages',
      'notices',
      'news',
      'merit',
      'teachers',
      'events',
      'gallery',
      'links',
      'downloads',
      'quotes',
      'login',
      'results',
      'footer',
    ],
  };
  await db
    .insert(settings)
    .values({
      schoolId: school.id,
      key: 'homepage_blocks',
      value: homepageDefaults,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [settings.schoolId, settings.key],
      set: { value: homepageDefaults, updatedAt: new Date() },
    });
  const blockNames = homepageDefaults.blocks.map((key, orderIndex) => ({
    schoolId: school.id,
    key,
    titleBn: key,
    orderIndex,
    isEnabled: true,
  }));
  await db
    .insert(homepageBlocks)
    .values(blockNames)
    .onConflictDoUpdate({
      target: [homepageBlocks.schoolId, homepageBlocks.key],
      set: { isEnabled: true, updatedAt: new Date() },
    });
  await db
    .insert(menus)
    .values({
      id: '10000000-0000-4000-8000-000000000001',
      schoolId: school.id,
      name: 'প্রধান মেনু',
      isActive: true,
    })
    .onConflictDoNothing();
  await db
    .insert(menuItems)
    .values([
      {
        id: '10000000-0000-4000-8000-000000000011',
        menuId: '10000000-0000-4000-8000-000000000001',
        labelBn: 'আমাদের বিদ্যালয়',
        href: '/about',
        orderIndex: 1,
      },
      {
        id: '10000000-0000-4000-8000-000000000012',
        menuId: '10000000-0000-4000-8000-000000000001',
        labelBn: 'বিজ্ঞপ্তি',
        href: '/notices',
        orderIndex: 2,
      },
      {
        id: '10000000-0000-4000-8000-000000000013',
        menuId: '10000000-0000-4000-8000-000000000001',
        labelBn: 'খবর',
        href: '/news',
        orderIndex: 3,
      },
      {
        id: '10000000-0000-4000-8000-000000000014',
        menuId: '10000000-0000-4000-8000-000000000001',
        labelBn: 'যোগাযোগ',
        href: '/contact',
        orderIndex: 4,
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(serviceBoxes)
    .values({
      id: '10000000-0000-4000-8000-000000000002',
      schoolId: school.id,
      titleBn: 'অনলাইন সেবা',
      icon: 'grid',
      orderIndex: 0,
      isEnabled: true,
    })
    .onConflictDoNothing();
  await db
    .insert(serviceBoxLinks)
    .values([
      {
        id: '10000000-0000-4000-8000-000000000021',
        serviceBoxId: '10000000-0000-4000-8000-000000000002',
        labelBn: 'ফলাফল অনুসন্ধান',
        href: '/result-search',
        orderIndex: 0,
      },
      {
        id: '10000000-0000-4000-8000-000000000022',
        serviceBoxId: '10000000-0000-4000-8000-000000000002',
        labelBn: 'ডাউনলোড',
        href: '/downloads',
        orderIndex: 1,
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(pages)
    .values([
      {
        id: '10000000-0000-4000-8000-000000000031',
        schoolId: school.id,
        slug: 'about',
        titleBn: 'আমাদের বিদ্যালয়',
        body: 'আদর্শ মডেল উচ্চ বিদ্যালয় ১৯৮৫ সাল থেকে কুড়িগ্রাম সদর এলাকার শিক্ষার্থীদের সেবা দিয়ে আসছে।',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-000000000032',
        schoolId: school.id,
        slug: 'headteacher-message',
        titleBn: 'প্রধান শিক্ষকের বাণী',
        body: 'শিক্ষা, শৃঙ্খলা ও মানবিক মূল্যবোধ আমাদের অঙ্গীকার।',
        isPublished: true,
        publishedAt: new Date(),
      },
    ])
    .onConflictDoUpdate({
      target: [pages.schoolId, pages.slug],
      set: { isPublished: true, updatedAt: new Date() },
    });
  await db
    .insert(banners)
    .values({
      id: '10000000-0000-4000-8000-000000000041',
      schoolId: school.id,
      imageUrl:
        'https://placehold.co/1200x450/21699D/FFFFFF?text=Adarsha+Model+High+School',
      titleBn: 'শিক্ষাই জাতির মেরুদণ্ড',
      captionBn: 'আদর্শ মডেল উচ্চ বিদ্যালয়',
      orderIndex: 0,
    })
    .onConflictDoNothing();
  await db
    .insert(notices)
    .values({
      id: '10000000-0000-4000-8000-000000000051',
      schoolId: school.id,
      titleBn: 'ভর্তি সংক্রান্ত নোটিশ',
      details: 'নতুন শিক্ষাবর্ষের ভর্তি কার্যক্রম শীঘ্রই শুরু হবে।',
      category: 'admission',
      isPinned: true,
      showTicker: true,
      isPublished: true,
      publishAt: new Date(),
    })
    .onConflictDoNothing();
  await db
    .insert(news)
    .values({
      id: '10000000-0000-4000-8000-000000000061',
      schoolId: school.id,
      titleBn: 'বার্ষিক ক্রীড়া প্রতিযোগিতা',
      summary: 'বিদ্যালয়ের বার্ষিক ক্রীড়া প্রতিযোগিতা অনুষ্ঠিত হয়েছে।',
      details:
        'শিক্ষার্থীদের অংশগ্রহণে আনন্দঘন পরিবেশে প্রতিযোগিতা অনুষ্ঠিত হয়।',
      publishedAt: new Date(),
      isPublished: true,
    })
    .onConflictDoNothing();
  await db
    .insert(events)
    .values({
      id: '10000000-0000-4000-8000-000000000071',
      schoolId: school.id,
      titleBn: 'অভিভাবক সমাবেশ',
      details: 'অভিভাবক ও শিক্ষকদের মতবিনিময় সভা।',
      venue: 'বিদ্যালয় মিলনায়তন',
      startsAt: new Date(Date.now() + 86400000),
    })
    .onConflictDoNothing();
  await db
    .insert(galleries)
    .values({
      id: '10000000-0000-4000-8000-000000000081',
      schoolId: school.id,
      titleBn: 'বিদ্যালয় প্রাঙ্গণ',
      coverUrl: 'https://placehold.co/640x360/21699D/FFFFFF?text=Gallery',
      isPublished: true,
    })
    .onConflictDoNothing();
  await db
    .insert(galleryItems)
    .values({
      id: '10000000-0000-4000-8000-000000000091',
      galleryId: '10000000-0000-4000-8000-000000000081',
      imageUrl: 'https://placehold.co/640x360/21699D/FFFFFF?text=School',
      captionBn: 'বিদ্যালয় প্রাঙ্গণ',
      orderIndex: 0,
    })
    .onConflictDoNothing();
  await db
    .insert(downloads)
    .values({
      id: '10000000-0000-4000-8000-0000000000a1',
      schoolId: school.id,
      titleBn: 'ভর্তি নির্দেশিকা',
      category: 'admission',
      fileUrl: 'https://example.com/admission-guide.pdf',
      isPublished: true,
    })
    .onConflictDoNothing();
  await db
    .insert(importantLinks)
    .values({
      id: '10000000-0000-4000-8000-0000000000b1',
      schoolId: school.id,
      labelBn: 'বাংলাদেশ শিক্ষা বোর্ড',
      url: 'https://educationboardresults.gov.bd',
      orderIndex: 0,
      isEnabled: true,
    })
    .onConflictDoNothing();
  const holidayValues = [
    ['শহীদ দিবস ও আন্তর্জাতিক মাতৃভাষা দিবস', '2026-02-21', '2026-02-21'],
    ['জাতির পিতার জন্মদিন ও জাতীয় শিশু দিবস', '2026-03-17', '2026-03-17'],
    ['পবিত্র ঈদুল ফিতর', '2026-03-20', '2026-03-24'],
    ['স্বাধীনতা ও জাতীয় দিবস', '2026-03-26', '2026-03-26'],
    ['বাংলা নববর্ষ', '2026-04-14', '2026-04-14'],
    ['মে দিবস', '2026-05-01', '2026-05-01'],
    ['পবিত্র ঈদুল আজহা', '2026-05-27', '2026-05-31'],
    ['মহান বিজয় দিবস', '2026-12-16', '2026-12-16'],
  ] as const;
  await db
    .insert(holidays)
    .values(
      holidayValues.map(([titleBn, fromDate, toDate], index) => ({
        id: `10000000-0000-4000-8000-0000000000c${index + 1}`,
        schoolId: school.id,
        titleBn,
        fromDate,
        toDate,
        isPublished: true,
      })),
    )
    .onConflictDoNothing();
  progress('holidays', holidayValues.length);
  const videoValues = [
    'বার্ষিক ক্রীড়া প্রতিযোগিতা',
    'বিজ্ঞান মেলা ও প্রদর্শনী',
    'বার্ষিক সাংস্কৃতিক অনুষ্ঠান',
    'মিলাদ ও দোয়া মাহফিল',
  ];
  await db
    .insert(videos)
    .values(
      videoValues.map((titleBn, index) => ({
        id: `10000000-0000-4000-8000-0000000000d${index + 1}`,
        schoolId: school.id,
        titleBn,
        thumbnailUrl:
          'https://placehold.co/640x360/0F3151/FFFFFF?text=Video',
        videoUrl: `https://example.org/videos/demo-${index + 1}`,
        publishedAt: new Date(),
        isPublished: true,
      })),
    )
    .onConflictDoNothing();
  progress('videos', videoValues.length);
  const committeeValues = [
    ['মোঃ আব্দুল করিম', 'সভাপতি'],
    ['বেগম শাহানা পারভীন', 'সহ-সভাপতি'],
    ['মোঃ নজরুল ইসলাম', 'সদস্য সচিব'],
    ['মোঃ হারুন অর রশীদ', 'সদস্য (শিক্ষক প্রতিনিধি)'],
    ['মোসাঃ রোকেয়া বেগম', 'সদস্য (অভিভাবক প্রতিনিধি)'],
    ['মোঃ সাইফুল ইসলাম', 'সদস্য (অভিভাবক প্রতিনিধি)'],
  ] as const;
  await db
    .insert(committee)
    .values(
      committeeValues.map(([nameBn, roleBn], index) => ({
        id: `10000000-0000-4000-8000-0000000000e${index + 1}`,
        schoolId: school.id,
        nameBn,
        roleBn,
        photoUrl: 'https://placehold.co/200x200/21699D/FFFFFF?text=Member',
        orderIndex: index,
        isPublished: true,
      })),
    )
    .onConflictDoNothing();
  progress('committee members', committeeValues.length);
  progress('content resources', 15);
  await db
    .insert(admissionSettings)
    .values({
      schoolId: school.id,
      isOpen: true,
      fields: ['nameBn', 'nameEn', 'guardianMobile'],
      seatCounts: { '6': 60, '7': 60 },
    })
    .onConflictDoUpdate({
      target: admissionSettings.schoolId,
      set: { isOpen: true, updatedAt: new Date() },
    });
  const admissionRows = [
    {
      id: fixedUuid(16000),
      schoolId: school.id,
      trackingId: 'ADM-2026-DEMO01',
      status: 'APPROVED',
      admissionClassId: classValues[0]!.id,
      sessionId,
      applicant: {
        nameBn: 'অনুমোদিত আবেদনকারী',
        guardianMobile: '01700000001',
      },
    },
    {
      id: fixedUuid(16001),
      schoolId: school.id,
      trackingId: 'ADM-2026-DEMO02',
      status: 'PENDING',
      admissionClassId: classValues[1]!.id,
      sessionId,
      applicant: {
        nameBn: 'অপেক্ষমাণ আবেদনকারী',
        guardianMobile: '01700000002',
      },
    },
    {
      id: fixedUuid(16002),
      schoolId: school.id,
      trackingId: 'ADM-2026-DEMO03',
      status: 'REJECTED',
      admissionClassId: classValues[2]!.id,
      sessionId,
      applicant: { nameBn: 'বাতিল আবেদনকারী', guardianMobile: '01700000003' },
      reviewNote: 'আসন পাওয়া যায়নি',
    },
  ];
  await db
    .insert(admissionApplications)
    .values(admissionRows)
    .onConflictDoUpdate({
      target: [
        admissionApplications.schoolId,
        admissionApplications.trackingId,
      ],
      set: {
        status: sql`excluded.status`,
        reviewNote: sql`excluded.review_note`,
        updatedAt: new Date(),
      },
    });
  const feeEventId = fixedUuid(15000);
  await db
    .insert(feeEvents)
    .values({
      id: feeEventId,
      schoolId: school.id,
      nameBn: 'অক্টোবর ২০২৬ — মাসিক বেতন',
      type: 'monthly',
      dueDate: '2026-10-10',
      lateFee: 5000,
      isPublished: true,
    })
    .onConflictDoNothing();
  await db
    .insert(feeEventClasses)
    .values(
      classValues.slice(0, 2).map((classRow, index) => ({
        id: fixedUuid(15001 + index),
        feeEventId,
        classId: classRow.id,
        amount: index === 0 ? 50000 : 60000,
      })),
    )
    .onConflictDoNothing();
  const seededDues = savedStudents
    .filter(
      (student) =>
        student.classId === classValues[0]!.id ||
        student.classId === classValues[1]!.id,
    )
    .slice(0, 6)
    .map((student, index) => ({
      schoolId: school.id,
      feeEventId,
      studentId: student.id,
      amount: student.classId === classValues[0]!.id ? 50000 : 60000,
      paidAmount: index === 0 ? 50000 : index === 1 ? 20000 : 0,
      dueDate: '2026-10-10',
      status: index === 0 ? 'PAID' : index === 1 ? 'PARTIAL' : 'DUE',
    }));
  await db.insert(studentFees).values(seededDues).onConflictDoNothing();
  const paidDue = seededDues[0];
  if (paidDue) {
    const [existingReceipt] = await db
      .select()
      .from(receipts)
      .where(eq(receipts.receiptNumber, 'RC-2026-000001'))
      .limit(1);
    if (!existingReceipt) {
      const [receipt] = await db
        .insert(receipts)
        .values({
          schoolId: school.id,
          receiptNumber: 'RC-2026-000001',
          verifyCode: 'DEMO20260001',
        })
        .returning();
      if (receipt) {
        const [savedDue] = await db
          .select()
          .from(studentFees)
          .where(
            and(
              eq(studentFees.feeEventId, feeEventId),
              eq(studentFees.studentId, paidDue.studentId),
            ),
          )
          .limit(1);
        if (savedDue)
          await db.insert(payments).values({
            schoolId: school.id,
            studentFeeId: savedDue.id,
            studentId: savedDue.studentId,
            amount: 50000,
            method: 'ক্যাশ',
            paidAt: '2026-10-05',
            collectedBy: markedBy,
            receiptId: receipt.id,
          });
      }
    }
  }
  await db
    .insert(salaryRecords)
    .values(
      teacherAccounts.slice(0, 2).map((teacher, index) => ({
        schoolId: school.id,
        teacherId: savedTeachers[index]?.id ?? fixedUuid(500 + index),
        salaryMonth: '2026-10',
        basic: 2500000,
        allowances: 200000,
        deductions: 50000,
        net: 2650000,
        status: 'PAID',
        paidAt: '2026-10-01',
        method: 'ব্যাংক',
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(ledgerEntries)
    .values([
      {
        schoolId: school.id,
        type: 'INCOME',
        amount: 100000,
        entryDate: '2026-10-03',
        description: 'ডেমো অনুদান',
        createdBy: markedBy,
      },
      {
        schoolId: school.id,
        type: 'EXPENSE',
        amount: 15000,
        entryDate: '2026-10-04',
        description: 'স্টেশনারি',
        createdBy: markedBy,
      },
    ])
    .onConflictDoNothing();
  progress(
    'admissions, fees and accounts',
    admissionRows.length + seededDues.length,
  );
  console.log(
    JSON.stringify({
      schoolId: school.id,
      credentialsPath,
      studentCount: savedStudents.length,
      attendanceRows: attendanceValues.length,
    }),
  );
}

async function main() {
  let db: SeedDb | undefined;
  let exitCode = 0;
  try {
    db = createDb();
    await seed(db);
    console.log('[seed] complete');
  } catch (error: unknown) {
    exitCode = 1;
    const failure = error as {
      message?: string;
      code?: string;
      detail?: string;
      constraint?: string;
    };
    console.error(
      JSON.stringify({
        message: failure.message ?? 'Seed failed',
        code: failure.code,
        detail: failure.detail,
        constraint: failure.constraint,
      }),
    );
  } finally {
    if (db) await db.$client.end({ timeout: 5 });
  }
  process.exitCode = exitCode;
}
void main();
