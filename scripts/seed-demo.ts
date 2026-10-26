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
  messages,
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
  admin: { email: string; password: string; identifier?: string };
  teacher: { email: string; password: string; identifier?: string };
  students: string[];
};
type SeedDb = ReturnType<typeof createDb>;
const credentialsPath = resolve(process.cwd(), '.demo-credentials.json');
const fixedUuid = (number: number) =>
  `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

function credentials(): Credentials {
  if (existsSync(credentialsPath)) {
    const saved = JSON.parse(readFileSync(credentialsPath, 'utf8')) as {
      admin: { password: string; email?: string; identifier?: string };
      teacher: { password: string; email?: string; identifier?: string };
      students: string[];
    };
    return {
      admin: { email: saved.admin.email ?? 'demo-admin@adarsha.test', password: saved.admin.password, identifier: saved.admin.identifier },
      teacher: { email: saved.teacher.email ?? 'demo-teacher@adarsha.test', password: saved.teacher.password, identifier: saved.teacher.identifier },
      students: saved.students,
    };
  }
  const value: Credentials = {
    admin: {
      email: 'demo-admin@adarsha.test',
      password: randomBytes(18).toString('base64url'),
    },
    teacher: {
      email: 'demo-teacher@adarsha.test',
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
  // Demo teachers carry real Bengali personal names (the teacher code
  // T-001… stays a code only — never the person's displayed name).
  const teacherNamesBn = [
    'মো. শফিকুল ইসলাম',
    'শারমিন আক্তার',
    'মো. রফিকুল ইসলাম',
    'ফারহানা ইয়াসমিন',
    'মো. কামরুল হাসান',
    'নুসরাত জাহান',
    'মো. আব্দুল মালেক',
    'তানিয়া সুলতানা',
    'মো. হারুন অর রশীদ',
    'রুমানা পারভীন',
    'মো. মিজানুর রহমান',
    'সাবিনা ইয়াসমিন',
  ];
  const passwordRows = [
    {
      schoolId: school.id,
      role: 'ADMIN' as const,
      username: login.admin.identifier ?? 'demo-admin',
      email: login.admin.email,
      passwordHash: await argon2.hash(login.admin.password),
      displayNameBn: 'ডেমো প্রশাসক',
    },
    {
      schoolId: school.id,
      role: 'TEACHER' as const,
      username: login.teacher.identifier ?? 'demo-teacher',
      email: login.teacher.email,
      passwordHash: await argon2.hash(login.teacher.password),
      displayNameBn: teacherNamesBn[0]!,
    },
    {
      schoolId: school.id,
      role: 'TEACHER' as const,
      username: 'demo-teacher-2',
      email: 'demo-teacher-2@adarsha.test',
      passwordHash: await argon2.hash('DemoTeacher2!2026'),
      displayNameBn: teacherNamesBn[1]!,
    },
    {
      schoolId: school.id,
      role: 'TEACHER' as const,
      username: 'demo-teacher-3',
      email: 'demo-teacher-3@adarsha.test',
      passwordHash: await argon2.hash('DemoTeacher3!2026'),
      displayNameBn: teacherNamesBn[2]!,
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
        displayNameBn: teacherNamesBn[index + 3]!,
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
  // Every demo student gets a realistic Bengali name, generated
  // deterministically from first/last name lists (no "ডেমো শিক্ষার্থী N").
  const studentFirstNamesBn = [
    'আরিফুল',
    'সুমাইয়া',
    'রাকিব',
    'মিম',
    'তানভীর',
    'নুসরাত',
    'সাকিব',
    'ফাতেমা',
    'মেহেদী',
    'শারমিন',
    'রফিক',
    'তাসনিম',
    'হাসান',
    'রুমানা',
    'ইমরান',
    'সাবিনা',
    'আরমান',
    'জান্নাতুল',
    'শাকিল',
    'মারিয়া',
    'রিয়াদ',
    'তানিয়া',
    'সোহেল',
    'আয়েশা',
  ];
  const studentLastNamesBn = [
    'ইসলাম',
    'আক্তার',
    'হাসান',
    'আহমেদ',
    'খাতুন',
    'রহমান',
    'উদ্দিন',
    'বেগম',
    'মিয়া',
    'সুলতানা',
    'হোসেন',
    'চৌধুরী',
  ];
  const studentNameBn = (index: number) =>
    `${studentFirstNamesBn[index % studentFirstNamesBn.length]} ${studentLastNamesBn[Math.floor(index / studentFirstNamesBn.length) % studentLastNamesBn.length]}`;
  const studentAccounts = studentRegistrations.map(
    (registrationNumber, index) => ({
      schoolId: school.id,
      role: 'STUDENT' as const,
      registrationNumber,
      displayNameBn: studentNameBn(index),
    }),
  );
  await db
    .insert(users)
    .values(studentAccounts)
    .onConflictDoUpdate({
      target: users.registrationNumber,
      set: {
        displayNameBn: sql`excluded.display_name_bn`,
        isActive: true,
        updatedAt: new Date(),
      },
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
  // Insert the standard BD board grading scale only when the school has
  // none yet — re-seeding must never duplicate or overwrite an edited scale.
  const existingScales = await db
    .select({ id: gradingScales.id })
    .from(gradingScales)
    .where(eq(gradingScales.schoolId, school.id));
  if (!existingScales.length) {
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
  }
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
      {
        id: '10000000-0000-4000-8000-000000000015',
        menuId: '10000000-0000-4000-8000-000000000001',
        labelBn: 'এক নজরে',
        href: '/at-a-glance',
        orderIndex: 5,
      },
      {
        id: '10000000-0000-4000-8000-000000000016',
        menuId: '10000000-0000-4000-8000-000000000001',
        labelBn: 'শিক্ষকবৃন্দ',
        href: '/teachers',
        orderIndex: 6,
      },
      {
        id: '10000000-0000-4000-8000-000000000017',
        menuId: '10000000-0000-4000-8000-000000000001',
        labelBn: 'পরিচালনা পরিষদ',
        href: '/committee',
        orderIndex: 7,
      },
      {
        id: '10000000-0000-4000-8000-000000000018',
        menuId: '10000000-0000-4000-8000-000000000001',
        labelBn: 'ভর্তি',
        href: '/admission',
        orderIndex: 8,
      },
      {
        id: '10000000-0000-4000-8000-000000000019',
        menuId: '10000000-0000-4000-8000-000000000001',
        labelBn: 'ফলাফল',
        href: '/results',
        orderIndex: 9,
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
      {
        id: '10000000-0000-4000-8000-000000000023',
        serviceBoxId: '10000000-0000-4000-8000-000000000002',
        labelBn: 'ভর্তি আবেদন',
        href: '/admission',
        orderIndex: 2,
      },
      {
        id: '10000000-0000-4000-8000-000000000024',
        serviceBoxId: '10000000-0000-4000-8000-000000000002',
        labelBn: 'রশিদ যাচাই',
        href: '/receipt-verify',
        orderIndex: 3,
      },
      {
        id: '10000000-0000-4000-8000-000000000025',
        serviceBoxId: '10000000-0000-4000-8000-000000000002',
        labelBn: 'নোটিশ বোর্ড',
        href: '/notices',
        orderIndex: 4,
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
        excerpt:
          '১৯৮৫ সালে প্রতিষ্ঠিত আদর্শ মডেল উচ্চ বিদ্যালয় কুড়িগ্রাম সদরের একটি ঐতিহ্যবাহী মাধ্যমিক শিক্ষাপ্রতিষ্ঠান।',
        body: '<p>আদর্শ মডেল উচ্চ বিদ্যালয় ১৯৮৫ সালে কুড়িগ্রাম সদর উপজেলায় প্রতিষ্ঠিত হয়। প্রতিষ্ঠার পর থেকে প্রতিষ্ঠানটি এলাকার ছেলে-মেয়েদের মানসম্মত মাধ্যমিক শিক্ষা দেওয়ার লক্ষ্যে নিরলসভাবে কাজ করে যাচ্ছে। বর্তমানে ষষ্ঠ থেকে দশম শ্রেণি পর্যন্ত পাঁচটি শ্রেণিতে শিক্ষার্থীরা অধ্যয়ন করছে।</p><h3>ইতিহাস</h3><p>এলাকার শিক্ষানুরাগী ব্যক্তিবর্গের উদ্যোগে ১৯৮৫ সালে মাত্র কয়েকটি কক্ষ ও অল্পসংখ্যক শিক্ষার্থী নিয়ে বিদ্যালয়ের যাত্রা শুরু হয়। পর্যায়ক্রমে ভবন সম্প্রসারণ, শিক্ষক নিয়োগ ও সহপাঠক্রমিক কার্যক্রমের মাধ্যমে প্রতিষ্ঠানটি আজ জেলার পরিচিত বিদ্যালয়গুলোর একটিতে পরিণত হয়েছে।</p><h3>সুযোগ-সুবিধা ও অবকাঠামো</h3><ul><li>আলো-বাতাসপূর্ণ শ্রেণিকক্ষ ও সুসজ্জিত অফিস কক্ষ</li><li>বিজ্ঞানাগার, কম্পিউটার ল্যাব ও সমৃদ্ধ পাঠাগার</li><li>খেলার মাঠ, স্কাউট দল ও সাংস্কৃতিক কার্যক্রম</li><li>নিয়মিত মূল্যায়ন, অভিভাবক সমাবেশ ও শিক্ষক-অভিভাবক যোগাযোগ</li></ul><h3>অর্জন</h3><p>বিদ্যালয়ের শিক্ষার্থীরা পাবলিক পরীক্ষায় ধারাবাহিক সাফল্য অর্জন করে আসছে। বিতর্ক, বিজ্ঞান মেলা, ক্রীড়া ও সাংস্কৃতিক প্রতিযোগিতায় উপজেলা ও জেলা পর্যায়ে বহু পুরস্কার অর্জিত হয়েছে।</p><h3>আমাদের লক্ষ্য</h3><p>শিক্ষার্থীদের জ্ঞান, দক্ষতা ও মানবিক মূল্যবোধে গড়ে তোলা; যাতে তারা সুনাগরিক হিসেবে দেশ ও সমাজের কল্যাণে কাজ করতে পারে — এটাই আমাদের প্রতিষ্ঠানের মূল লক্ষ্য।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-000000000032',
        schoolId: school.id,
        slug: 'headteacher-message',
        titleBn: 'প্রধান শিক্ষকের বাণী',
        excerpt:
          'শিক্ষা, শৃঙ্খলা ও মানবিক মূল্যবোধ — এই তিনের সমন্বয়েই গড়ে ওঠে একজন পূর্ণাঙ্গ মানুষ।',
        body: '<p>আসসালামু আলাইকুম। আদর্শ মডেল উচ্চ বিদ্যালয়ের ওয়েবসাইটে সবাইকে স্বাগতম। শিক্ষা শুধু পাঠ্যবইয়ের জ্ঞান নয়; শিক্ষা হলো চরিত্র গঠন, শৃঙ্খলা ও মানবিক মূল্যবোধের চর্চা। আমাদের প্রতিটি শিক্ষক ও কর্মচারী সেই লক্ষ্যেই নিবেদিতভাবে কাজ করে যাচ্ছেন।</p><p>আমরা বিশ্বাস করি, প্রতিটি শিক্ষার্থীর ভেতরেই সুপ্ত সম্ভাবনা রয়েছে। নিয়মিত পাঠদান, ধারাবাহিক মূল্যায়ন, খেলাধুলা ও সাংস্কৃতিক কর্মকাণ্ডের মাধ্যমে সেই সম্ভাবনাকে বিকশিত করাই আমাদের কাজ। অভিভাবকদের সক্রিয় অংশগ্রহণ ও পরামর্শ আমাদের এগিয়ে যাওয়ার প্রেরণা।</p><p>সবার সহযোগিতায় এই প্রতিষ্ঠান আরও সমৃদ্ধ হবে — এই প্রত্যাশা রেখে সবাইকে আন্তরিক শুভেচ্ছা জানাচ্ছি।</p><p><strong>মো. শফিকুল ইসলাম</strong><br/>প্রধান শিক্ষক, আদর্শ মডেল উচ্চ বিদ্যালয়</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-000000000033',
        schoolId: school.id,
        slug: 'at-a-glance',
        titleBn: 'এক নজরে বিদ্যালয়',
        excerpt:
          'প্রতিষ্ঠার সাল, EIIN, শিক্ষক-শিক্ষার্থী সংখ্যা ও অবস্থান — আদর্শ মডেল উচ্চ বিদ্যালয়ের সংক্ষিপ্ত পরিচিতি এক নজরে।',
        body: '<p>আদর্শ মডেল উচ্চ বিদ্যালয় কুড়িগ্রাম সদর উপজেলার একটি সুপরিচিত মাধ্যমিক শিক্ষাপ্রতিষ্ঠান। ১৯৮৫ সালে প্রতিষ্ঠিত এই বিদ্যালয়ে ষষ্ঠ থেকে দশম শ্রেণি পর্যন্ত পাঠদান করা হয়। অভিজ্ঞ শিক্ষকমণ্ডলী, সুশৃঙ্খল পরিবেশ ও ধারাবাহিক ফলাফলের জন্য বিদ্যালয়টি এলাকায় সমাদৃত।</p><p>বিদ্যালয়ে বিজ্ঞানাগার, কম্পিউটার ল্যাব, পাঠাগার ও খেলার মাঠ রয়েছে। পড়াশোনার পাশাপাশি স্কাউট, খেলাধুলা, বিতর্ক ও সাংস্কৃতিক কর্মকাণ্ডে শিক্ষার্থীদের অংশগ্রহণ উৎসাহিত করা হয়। বিস্তারিত সংখ্যাগত তথ্য পাশের তথ্য-ছকে দেওয়া হলো।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-000000000034',
        schoolId: school.id,
        slug: 'committee',
        titleBn: 'পরিচালনা পরিষদ',
        excerpt:
          'বিদ্যালয়ের সামগ্রিক পরিচালনা, নীতি নির্ধারণ ও তত্ত্বাবধানের দায়িত্বে রয়েছে পরিচালনা পরিষদ।',
        body: '<p>আদর্শ মডেল উচ্চ বিদ্যালয়ের পরিচালনা পরিষদ বিদ্যালয়ের একাডেমিক ও প্রশাসনিক কার্যক্রমের নীতি নির্ধারণ, বাজেট অনুমোদন এবং সার্বিক তত্ত্বাবধান করে থাকে। সভাপতির নেতৃত্বে পরিষদে শিক্ষক প্রতিনিধি, অভিভাবক প্রতিনিধি, দাতা সদস্য ও বিদ্যোৎসাহী সদস্য রয়েছেন।</p><p>পরিষদ নিয়মিত সভায় মিলিত হয়ে বিদ্যালয়ের উন্নয়ন পরিকল্পনা, শিক্ষার মানোন্নয়ন ও শিক্ষার্থীদের কল্যাণমূলক সিদ্ধান্ত গ্রহণ করে। পরিষদের সদস্যদের তালিকা নিচে দেওয়া হলো।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-000000000035',
        schoolId: school.id,
        slug: 'scout-club',
        titleBn: 'স্কাউট',
        excerpt:
          'শৃঙ্খলা, নেতৃত্ব ও সেবার মানসিকতা গড়তে বিদ্যালয়ের স্কাউট দল সক্রিয়ভাবে কাজ করে যাচ্ছে।',
        body: '<h3>স্কাউট কার্যক্রমের ইতিহাস</h3><p>আদর্শ মডেল উচ্চ বিদ্যালয়ের স্কাউট দল প্রতিষ্ঠার পর থেকেই সক্রিয়। দলটি উপজেলা ও জেলা পর্যায়ের বিভিন্ন ক্যাম্প, paral ও সেবামূলক কর্মসূচিতে নিয়মিত অংশ নিয়ে আসছে।</p><h3>কার্যক্রম</h3><ul><li>প্রতি সপ্তাহে নির্ধারিত দিনে স্কাউট প্রশিক্ষণ ও প্যারেড</li><li>জাতীয় দিবসসমূহে কুচকাওয়াজ ও শৃঙ্খলা রক্ষায় সহায়তা</li><li>বৃক্ষরোপণ, পরিষ্কার-পরিচ্ছন্নতা ও দুর্যোগকালীন সেবা কার্যক্রম</li><li>বার্ষিক স্কাউট ক্যাম্প ও হাইকিংয়ে অংশগ্রহণ</li></ul><h3>সদস্য ও ইউনিট তথ্য</h3><p>বর্তমানে বিদ্যালয়ে একটি স্কাউট ইউনিট সক্রিয় রয়েছে, যেখানে বিভিন্ন শ্রেণির শিক্ষার্থীরা সদস্য হিসেবে অন্তর্ভুক্ত। আগ্রহী শিক্ষার্থীরা দায়িত্বপ্রাপ্ত শিক্ষকের সঙ্গে যোগাযোগ করে সদস্য হতে পারে।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-000000000036',
        schoolId: school.id,
        slug: 'sports',
        titleBn: 'ক্রীড়া',
        excerpt:
          'সুস্থ দেহে সুন্দর মন — বার্ষিক ক্রীড়া প্রতিযোগিতা ও আন্তঃশ্রেণি টুর্নামেন্টের মধ্য দিয়ে শিক্ষার্থীদের ক্রীড়া চর্চা।',
        body: '<p>পড়াশোনার পাশাপাশি খেলাধুলাকে বিদ্যালয় সমান গুরুত্ব দেয়। প্রতি বছর বার্ষিক ক্রীড়া প্রতিযোগিতা আয়োজন করা হয়, যেখানে দৌড়, লাফ, ক্রিকেট, ফুটবলসহ বিভিন্ন ইভেন্টে শিক্ষার্থীরা অংশ নেয়।</p><p>আন্তঃশ্রেণি ফুটবল ও ক্রিকেট টুর্নামেন্ট, উপজেলা ও জেলা পর্যায়ের প্রতিযোগিতায় অংশগ্রহণ এবং দৈনন্দিন শরীরচর্চা — এসবের মাধ্যমে শিক্ষার্থীদের শারীরিক সুস্থতা, দলগত কাজের মানসিকতা ও নেতৃত্বের গুণাবলি বিকশিত হয়।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-000000000037',
        schoolId: school.id,
        slug: 'science-club',
        titleBn: 'বিজ্ঞান ক্লাব',
        excerpt:
          'কৌতূহল থেকে উদ্ভাবন — বিজ্ঞান ক্লাবের মাধ্যমে শিক্ষার্থীদের গবেষণা ও প্রকল্পভিত্তিক শেখার সুযোগ।',
        body: '<p>বিদ্যালয়ের বিজ্ঞান ক্লাব শিক্ষার্থীদের মধ্যে বৈজ্ঞানিক চিন্তাভাবনা ও উদ্ভাবনী মানসিকতা গড়ে তুলতে কাজ করে। ক্লাবের সদস্যরা শিক্ষকদের তত্ত্বাবধানে বিভিন্ন পরীক্ষা-নিরীক্ষা ও মডেল প্রকল্প তৈরি করে।</p><ul><li>বার্ষিক বিজ্ঞান মেলা ও প্রকল্প প্রদর্শনী</li><li>উপজেলা ও জেলা বিজ্ঞান প্রতিযোগিতায় অংশগ্রহণ</li><li>সাপ্তাহিক বিজ্ঞান আলোচনা ও কুইজ</li></ul><p>বিজ্ঞান বিষয়ে আগ্রহী যেকোনো শিক্ষার্থী ক্লাবের সদস্য হতে পারে।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-000000000038',
        schoolId: school.id,
        slug: 'admission-info',
        titleBn: 'ভর্তি নির্দেশনা',
        excerpt:
          'নতুন শিক্ষাবর্ষে ভর্তির যোগ্যতা, প্রয়োজনীয় কাগজপত্র, ফি কাঠামো ও সময়সূচি — সব তথ্য এক জায়গায়।',
        body: '<h3>ভর্তির সাধারণ নির্দেশনা</h3><p>প্রতি শিক্ষাবর্ষের শুরুতে ষষ্ঠ শ্রেণিসহ অন্যান্য শ্রেণিতে শূন্য আসনে ভর্তি নেওয়া হয়। ভর্তির বিজ্ঞপ্তি বিদ্যালয়ের নোটিশ বোর্ড ও ওয়েবসাইটে প্রকাশ করা হয়। আগ্রহী অভিভাবকগণ অনলাইনে আবেদন করতে পারবেন অথবা অফিস থেকে ফর্ম সংগ্রহ করতে পারবেন।</p><h3>প্রয়োজনীয় কাগজপত্র</h3><ul><li>শিক্ষার্থীর জন্ম নিবন্ধন সনদের ফটোকপি</li><li>পিতা ও মাতার জাতীয় পরিচয়পত্রের ফটোকপি</li><li>পূর্ববর্তী বিদ্যালয়ের ছাড়পত্র (প্রযোজ্য ক্ষেত্রে)</li><li>সদ্য তোলা পাসপোর্ট সাইজের ছবি — ২ কপি</li><li>পূর্ববর্তী শ্রেণির বার্ষিক পরীক্ষার নম্বরপত্র</li></ul><h3>ভর্তি ফি কাঠামো (ডেমো)</h3><ul><li>ভর্তি ফি — ৫০০ টাকা</li><li>সেশন ফি — ৩০০ টাকা</li><li>মাসিক বেতন — শ্রেণিভেদে ৫০০–৬০০ টাকা</li></ul><h3>সময়সূচি</h3><p>আবেদন গ্রহণ সাধারণত ডিসেম্বর মাসে শুরু হয় এবং মেধা ও আসন খালি থাকা সাপেক্ষে জানুয়ারির প্রথম সপ্তাহে ভর্তি সম্পন্ন হয়। ভর্তির অবস্থা ওয়েবসাইটের ভর্তি যাচাই পেজ থেকে ট্র্যাকিং নম্বর দিয়ে জানা যাবে।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-000000000039',
        schoolId: school.id,
        slug: 'rti',
        titleBn: 'তথ্য অধিকার (RTI)',
        excerpt:
          'তথ্য অধিকার আইন অনুযায়ী বিদ্যালয় সংক্রান্ত তথ্য পাওয়ার প্রক্রিয়া ও দায়িত্বপ্রাপ্ত কর্মকর্তার তথ্য।',
        body: '<p>তথ্য অধিকার আইন, ২০০৯ অনুযায়ী যেকোনো নাগরিক নির্ধারিত প্রক্রিয়ায় বিদ্যালয় সংক্রান্ত তথ্য চাইতে পারেন। আবেদন লিখিতভাবে অথবা অনলাইন ফরমের মাধ্যমে জমা দেওয়া যায়। আবেদন নিষ্পত্তির সময়সীমা — ২০ কর্মদিবস।</p><h3>দায়িত্বপ্রাপ্ত কর্মকর্তা (ডেমো তথ্য)</h3><ul><li>নাম — মো. শফিকুল ইসলাম</li><li>পদবি — প্রধান শিক্ষক (দায়িত্বপ্রাপ্ত কর্মকর্তা, তথ্য)</li><li>যোগাযোগ — বিদ্যালয় অফিস, কুড়িগ্রাম সদর, কুড়িগ্রাম</li><li>ফোন — 01700000000</li></ul><p>তথ্য না পেলে অথবা বিলম্ব হলে আপিল কর্তৃপক্ষের কাছে আবেদন করা যাবে। এ বিষয়ে বিস্তারিত জানতে অফিসে যোগাযোগ করুন।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-00000000003a',
        schoolId: school.id,
        slug: 'citizen-charter',
        titleBn: 'সেবা প্রদান প্রতিশ্রুতি (সিটিজেন চার্টার)',
        excerpt:
          'কোন সেবা কত দিনে, কীভাবে পাওয়া যাবে — বিদ্যালয়ের সেবা প্রদান প্রতিশ্রুতির তালিকা।',
        body: '<p>বিদ্যালয় থেকে প্রদত্ত প্রধান সেবাসমূহ ও সেগুলো পাওয়ার প্রতিশ্রুত সময়সীমা নিচে দেওয়া হলো:</p><ul><li>প্রশংসাপত্র / চারিত্রিক সনদ প্রদান — ৩ কর্মদিবস</li><li>নম্বরপত্র / মার্কশিটের অনুলিপি — ২ কর্মদিবস</li><li>ছাড়পত্র (টিসি) প্রদান — ৩ কর্মদিবস</li><li>ভর্তি-সংক্রান্ত তথ্য ও ফরম বিতরণ — তাৎক্ষণিক</li><li>রশিদ যাচাই ও ফি-সংক্রান্ত তথ্য — তাৎক্ষণিক (অনলাইনে)</li></ul><p>প্রতিশ্রুত সময়ে সেবা না পেলে পরিচালনা পরিষদ অথবা অভিযোগ প্রতিকার ব্যবস্থার (GRS) মাধ্যমে জানানো যাবে।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-00000000003b',
        schoolId: school.id,
        slug: 'apa',
        titleBn: 'বার্ষিক কর্মসম্পাদন চুক্তি (APA)',
        excerpt:
          'বার্ষিক কর্মসম্পাদন চুক্তির আওতায় বিদ্যালয়ের লক্ষ্যমাত্রা ও অর্জনের সারসংক্ষেপ।',
        body: '<p>বার্ষিক কর্মসম্পাদন চুক্তি (APA) অনুযায়ী বিদ্যালয় প্রতি বছর পাঠদানের মান, শিক্ষার্থী উপস্থিতি, পরীক্ষার ফলাফল ও সহপাঠক্রমিক কার্যক্রমে নির্দিষ্ট লক্ষ্যমাত্রা নির্ধারণ করে।</p><ul><li>শিক্ষার্থী গড় উপস্থিতি — ন্যূনতম ৯০%</li><li>পাবলিক পরীক্ষায় উত্তীর্ণের হার — লক্ষ্যমাত্রা ৯৮%</li><li>শিক্ষকদের বিষয়ভিত্তিক প্রশিক্ষণে অংশগ্রহণ — ১০০%</li><li>অভিভাবক সমাবেশ আয়োজন — বছরে কমপক্ষে ২টি</li></ul><p>ত্রৈমাসিক ভিত্তিতে লক্ষ্যমাত্রার অগ্রগতি পর্যালোচনা করা হয় এবং ফলাফল পরিচালনা পরিষদে উপস্থাপন করা হয়।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-00000000003c',
        schoolId: school.id,
        slug: 'nis',
        titleBn: 'জাতীয় শুদ্ধাচার কৌশল (NIS)',
        excerpt:
          'সততা, স্বচ্ছতা ও জবাবদিহি নিশ্চিত করতে জাতীয় শুদ্ধাচার কৌশল বাস্তবায়নে বিদ্যালয়ের উদ্যোগ।',
        body: '<p>জাতীয় শুদ্ধাচার কৌশল বাস্তবায়নের অংশ হিসেবে বিদ্যালয়ে শুদ্ধাচার চর্চা, স্বচ্ছ আর্থিক ব্যবস্থাপনা ও জবাবদিহিমূলক প্রশাসন চালু রয়েছে।</p><ul><li>শুদ্ধাচার সংক্রান্ত ফোকাল পয়েন্ট কর্মকর্তা নির্ধারিত</li><li>সব ফি আদায় রশিদের মাধ্যমে ও অনলাইনে যাচাইযোগ্য</li><li>শিক্ষক-শিক্ষার্থীদের জন্য সততা ও নৈতিকতা বিষয়ক সচেতনতামূলক কার্যক্রম</li><li>ত্রৈমাসিক শুদ্ধাচার অগ্রগতি প্রতিবেদন প্রণয়ন</li></ul><p>যেকোনো অনিয়মের তথ্য অভিযোগ প্রতিকার ব্যবস্থার মাধ্যমে গোপনীয়তা রক্ষা করে জানানো যাবে।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-00000000003d',
        schoolId: school.id,
        slug: 'grs',
        titleBn: 'অভিযোগ প্রতিকার ব্যবস্থা (GRS)',
        excerpt:
          'বিদ্যালয় সংক্রান্ত যেকোনো অভিযোগ দাখিল ও নিষ্পত্তির প্রক্রিয়া।',
        body: '<p>বিদ্যালয়ের সেবা সংক্রান্ত যেকোনো অভিযোগ অনলাইন ফরম, লিখিত আবেদন অথবা সরাসরি অফিসে জমা দেওয়া যাবে। প্রতিটি অভিযোগ নিবন্ধন করে একটি নম্বর দেওয়া হয় এবং সাধারণত ১৫ কর্মদিবসের মধ্যে নিষ্পত্তি করা হয়।</p><ul><li>অনলাইন — এই ওয়েবসাইটের কমপ্লায়েন্স পেজের অভিযোগ ফরম</li><li>লিখিত — বিদ্যালয় অফিসে রক্ষিত অভিযোগ বাক্স / সরাসরি জমা</li><li>নিষ্পত্তির সময়সীমা — ১৫ কর্মদিবস</li></ul><p>অভিযোগের সিদ্ধান্তে সন্তুষ্ট না হলে পরিচালনা পরিষদের সভাপতির কাছে আপিল করা যাবে।</p>',
        isPublished: true,
        publishedAt: new Date(),
      },
    ])
    .onConflictDoUpdate({
      target: [pages.schoolId, pages.slug],
      set: {
        titleBn: sql`excluded.title_bn`,
        body: sql`excluded.body`,
        excerpt: sql`excluded.excerpt`,
        isPublished: true,
        updatedAt: new Date(),
      },
    });
  await db
    .insert(messages)
    .values([
      {
        id: '10000000-0000-4000-8000-0000000000f1',
        schoolId: school.id,
        personNameBn: teacherNamesBn[0]!,
        designationBn: 'প্রধান শিক্ষক',
        photoUrl:
          'https://placehold.co/240x240/21699D/FFFFFF?text=Head+Teacher',
        body: 'শিক্ষা, শৃঙ্খলা ও মানবিক মূল্যবোধের সমন্বয়ে প্রতিটি শিক্ষার্থীকে সুনাগরিক হিসেবে গড়ে তোলাই আমাদের অঙ্গীকার। অভিভাবক, শিক্ষক ও শিক্ষার্থী — সবার সম্মিলিত প্রচেষ্টায় আমাদের বিদ্যালয় এগিয়ে যাবে ইনশাআল্লাহ।',
        orderIndex: 0,
        isEnabled: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000f2',
        schoolId: school.id,
        personNameBn: 'মোঃ আব্দুল করিম',
        designationBn: 'সভাপতি, পরিচালনা পরিষদ',
        photoUrl:
          'https://placehold.co/240x240/1E7A46/FFFFFF?text=Chairman',
        body: 'পরিচালনা পরিষদের পক্ষ থেকে সবাইকে আন্তরিক শুভেচ্ছা। স্বচ্ছতা ও জবাবদিহি বজায় রেখে বিদ্যালয়ের সার্বিক উন্নয়নে পরিষদ কাজ করে যাচ্ছে। শিক্ষার মানোন্নয়নে অভিভাবক ও এলাকাবাসীর সহযোগিতা আমাদের প্রেরণা।',
        orderIndex: 1,
        isEnabled: true,
      },
    ])
    .onConflictDoNothing();
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
    .values([
      {
        id: '10000000-0000-4000-8000-000000000051',
        schoolId: school.id,
        titleBn: 'ভর্তি সংক্রান্ত নোটিশ',
        details: 'নতুন শিক্ষাবর্ষের ভর্তি কার্যক্রম শীঘ্রই শুরু হবে।',
        category: 'admission',
        isPinned: true,
        showTicker: true,
        isPublished: true,
        publishAt: new Date(),
      },
      {
        id: '10000000-0000-4000-8000-000000000052',
        schoolId: school.id,
        titleBn: 'অর্ধ-বার্ষিক পরীক্ষার ফলাফল প্রকাশ',
        details:
          'অর্ধ-বার্ষিক পরীক্ষার ফলাফল প্রকাশিত হয়েছে। শিক্ষার্থীরা ওয়েবসাইটের ফলাফল অনুসন্ধান পেজ থেকে রেজিস্ট্রেশন নম্বর দিয়ে ফলাফল দেখতে পারবে।',
        category: 'exam',
        isPinned: true,
        showTicker: true,
        isPublished: true,
        publishAt: new Date('2026-10-18T00:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000053',
        schoolId: school.id,
        titleBn: 'বার্ষিক পরীক্ষার সময়সূচি প্রকাশ',
        details:
          'আগামী ১ ডিসেম্বর থেকে বার্ষিক পরীক্ষা শুরু হবে। শ্রেণিভিত্তিক পূর্ণাঙ্গ সময়সূচি ডাউনলোড সেকশন ও নোটিশ বোর্ডে প্রকাশ করা হয়েছে।',
        category: 'exam',
        isPinned: false,
        showTicker: false,
        isPublished: true,
        publishAt: new Date('2026-10-20T00:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000054',
        schoolId: school.id,
        titleBn: 'ষষ্ঠ শ্রেণিতে ভর্তি আবেদন শুরু',
        details:
          '২০২৭ শিক্ষাবর্ষে ষষ্ঠ শ্রেণিতে ভর্তির অনলাইন আবেদন শুরু হয়েছে। আবেদনের শেষ তারিখ ও প্রয়োজনীয় কাগজপত্রের তালিকা ভর্তি নির্দেশনা পেজে দেওয়া আছে।',
        category: 'admission',
        isPinned: true,
        showTicker: true,
        isPublished: true,
        publishAt: new Date('2026-10-15T00:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000055',
        schoolId: school.id,
        titleBn: 'দুর্গাপূজা উপলক্ষে ছুটির ঘোষণা',
        details:
          'দুর্গাপূজা উপলক্ষে বিদ্যালয় নির্ধারিত দিনগুলোতে বন্ধ থাকবে। ছুটির বিস্তারিত তালিকা ছুটির পেজে দেখা যাবে।',
        category: 'holiday',
        isPinned: false,
        showTicker: false,
        isPublished: true,
        publishAt: new Date('2026-10-12T00:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000056',
        schoolId: school.id,
        titleBn: 'শীতকালীন ছুটির আগাম ঘোষণা',
        details:
          'আগামী ২০ ডিসেম্বর থেকে ৩১ ডিসেম্বর পর্যন্ত শীতকালীন ছুটি থাকবে। ১ জানুয়ারি থেকে নিয়মিত শ্রেণি কার্যক্রম শুরু হবে।',
        category: 'holiday',
        isPinned: false,
        showTicker: false,
        isPublished: true,
        publishAt: new Date('2026-10-08T00:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000057',
        schoolId: school.id,
        titleBn: 'অভিভাবক সমাবেশের আমন্ত্রণ',
        details:
          'শিক্ষার্থীদের পড়াশোনার অগ্রগতি নিয়ে অভিভাবক ও শিক্ষকদের মতবিনিময় সভা বিদ্যালয় মিলনায়তনে অনুষ্ঠিত হবে। সকল অভিভাবককে উপস্থিত থাকার জন্য অনুরোধ করা হলো।',
        category: 'general',
        isPinned: false,
        showTicker: false,
        isPublished: true,
        publishAt: new Date('2026-10-10T00:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000058',
        schoolId: school.id,
        titleBn: 'পাঠাগারের বই ফেরতের অনুরোধ',
        details:
          'যেসব শিক্ষার্থী পাঠাগার থেকে বই নিয়েছে, তাদের বার্ষিক পরীক্ষা শুরুর আগেই বই ফেরত দেওয়ার জন্য অনুরোধ করা হলো।',
        category: 'general',
        isPinned: false,
        showTicker: false,
        isPublished: true,
        publishAt: new Date('2026-10-06T00:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000059',
        schoolId: school.id,
        titleBn: 'স্কাউট দলের সাপ্তাহিক প্রশিক্ষণ',
        details:
          'স্কাউট দলের সদস্যদের প্রতি সপ্তাহে নির্ধারিত দিনে বিদ্যালয় মাঠে প্রশিক্ষণে অংশ নিতে বলা হলো। নতুন সদস্য হতে আগ্রহীরা দায়িত্বপ্রাপ্ত শিক্ষকের সঙ্গে যোগাযোগ করবে।',
        category: 'general',
        isPinned: false,
        showTicker: false,
        isPublished: true,
        publishAt: new Date('2026-10-03T00:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-00000000005a',
        schoolId: school.id,
        titleBn: 'বৃত্তি পরীক্ষার প্রস্তুতিমূলক ক্লাস',
        details:
          'বৃত্তি পরীক্ষায় অংশগ্রহণকারী শিক্ষার্থীদের জন্য বিশেষ প্রস্তুতিমূলক ক্লাসের ব্যবস্থা করা হয়েছে। সময়সূচি শ্রেণি শিক্ষকের কাছ থেকে জেনে নিতে হবে।',
        category: 'exam',
        isPinned: false,
        showTicker: false,
        isPublished: true,
        publishAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ])
    .onConflictDoNothing();
  // The news table has no separate `body` column — the public API exposes
  // `details` as `body`, so the long-form article text lives in `details`
  // (HTML paragraphs) and `summary` stays the short listing text.
  await db
    .insert(news)
    .values([
      {
        id: '10000000-0000-4000-8000-000000000061',
        schoolId: school.id,
        titleBn: 'বার্ষিক ক্রীড়া প্রতিযোগিতা',
        summary: 'বিদ্যালয়ের বার্ষিক ক্রীড়া প্রতিযোগিতা অনুষ্ঠিত হয়েছে।',
        details:
          '<p>শিক্ষার্থীদের অংশগ্রহণে আনন্দঘন পরিবেশে বিদ্যালয়ের বার্ষিক ক্রীড়া প্রতিযোগিতা অনুষ্ঠিত হয়। দিনব্যাপী আয়োজনে দৌড়, দীর্ঘ লাফ, ক্রিকেট ও ফুটবলসহ বিভিন্ন ইভেন্টে শিক্ষার্থীরা অংশ নেয়।</p><p>অনুষ্ঠানে প্রধান অতিথি হিসেবে উপস্থিত ছিলেন পরিচালনা পরিষদের সভাপতি। বিজয়ীদের মাঝে পুরস্কার ও সনদ বিতরণের মধ্য দিয়ে অনুষ্ঠান শেষ হয়।</p>',
        imageUrl:
          'https://placehold.co/800x450/21699D/FFFFFF?text=Annual+Sports',
        publishedAt: new Date(),
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000062',
        schoolId: school.id,
        titleBn: 'নবীন বরণ অনুষ্ঠান অনুষ্ঠিত',
        summary:
          'নতুন শিক্ষাবর্ষে ভর্তি হওয়া শিক্ষার্থীদের বরণ করে নিল আদর্শ মডেল উচ্চ বিদ্যালয়।',
        details:
          '<p>নতুন শিক্ষাবর্ষে ভর্তি হওয়া শিক্ষার্থীদের আনুষ্ঠানিকভাবে বরণ করে নেওয়া হয়েছে। অনুষ্ঠানে নবীন শিক্ষার্থীদের ফুল দিয়ে স্বাগত জানান জ্যেষ্ঠ শিক্ষার্থী ও শিক্ষকবৃন্দ।</p><p>প্রধান শিক্ষক তাঁর বক্তব্যে বিদ্যালয়ের নিয়ম-শৃঙ্খলা, পাঠদান পদ্ধতি ও সহপাঠক্রমিক কার্যক্রম সম্পর্কে ধারণা দেন। সাংস্কৃতিক পরিবেশনার মধ্য দিয়ে অনুষ্ঠান শেষ হয়।</p>',
        imageUrl:
          'https://placehold.co/800x450/1E7A46/FFFFFF?text=Orientation',
        publishedAt: new Date('2026-01-12T00:00:00.000Z'),
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000063',
        schoolId: school.id,
        titleBn: 'বিজ্ঞান মেলায় শিক্ষার্থীদের প্রকল্প প্রদর্শনী',
        summary:
          'দুই দিনব্যাপী বিজ্ঞান মেলায় শিক্ষার্থীদের তৈরি নানা উদ্ভাবনী প্রকল্প প্রদর্শিত হয়েছে।',
        details:
          '<p>বিদ্যালয়ের বিজ্ঞান ক্লাবের উদ্যোগে দুই দিনব্যাপী বিজ্ঞান মেলা অনুষ্ঠিত হয়েছে। মেলায় বিভিন্ন শ্রেণির শিক্ষার্থীরা সৌরশক্তি, পানি পরিশোধন, স্মার্ট সেচসহ নানা বিষয়ে প্রকল্প উপস্থাপন করে।</p><p>বিচারকমণ্ডলী সেরা তিনটি প্রকল্পকে পুরস্কৃত করেন। অভিভাবক ও অতিথিরা শিক্ষার্থীদের উদ্ভাবনী চিন্তার প্রশংসা করেন।</p>',
        imageUrl:
          'https://placehold.co/800x450/0F3151/FFFFFF?text=Science+Fair',
        publishedAt: new Date('2026-09-18T00:00:00.000Z'),
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000064',
        schoolId: school.id,
        titleBn: 'এসএসসি পরীক্ষার্থীদের বিদায় সংবর্ধনা',
        summary:
          'এসএসসি পরীক্ষার্থীদের বিদায় সংবর্ধনা ও দোয়া মাহফিল অনুষ্ঠিত হয়েছে।',
        details:
          '<p>এ বছরের এসএসসি পরীক্ষার্থীদের বিদায় সংবর্ধনা ও দোয়া মাহফিল বিদ্যালয় মিলনায়তনে অনুষ্ঠিত হয়েছে। শিক্ষকবৃন্দ পরীক্ষার্থীদের সাফল্য কামনা করে দিকনির্দেশনামূলক বক্তব্য দেন।</p><p>অনুষ্ঠানে কৃতী শিক্ষার্থীদের সম্মাননা দেওয়া হয় এবং সবার জন্য বিশেষ দোয়া করা হয়।</p>',
        imageUrl:
          'https://placehold.co/800x450/21699D/FFFFFF?text=Farewell',
        publishedAt: new Date('2026-02-15T00:00:00.000Z'),
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000065',
        schoolId: school.id,
        titleBn: 'মহান স্বাধীনতা দিবস উদ্‌যাপন',
        summary:
          'আলোচনা সভা, কুচকাওয়াজ ও সাংস্কৃতিক অনুষ্ঠানের মধ্য দিয়ে মহান স্বাধীনতা দিবস উদ্‌যাপিত হয়েছে।',
        details:
          '<p>মহান স্বাধীনতা ও জাতীয় দিবস উপলক্ষে বিদ্যালয়ে আলোচনা সভা, স্কাউট দলের কুচকাওয়াজ ও সাংস্কৃতিক অনুষ্ঠানের আয়োজন করা হয়। শিক্ষার্থীরা মুক্তিযুদ্ধের ইতিহাস নিয়ে বক্তৃতা ও আবৃত্তি পরিবেশন করে।</p><p>প্রধান শিক্ষক তাঁর বক্তব্যে নতুন প্রজন্মের কাছে মুক্তিযুদ্ধের চেতনা পৌঁছে দেওয়ার ওপর গুরুত্বারোপ করেন।</p>',
        imageUrl:
          'https://placehold.co/800x450/1E7A46/FFFFFF?text=Independence+Day',
        publishedAt: new Date('2026-03-26T00:00:00.000Z'),
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000066',
        schoolId: school.id,
        titleBn: 'বার্ষিক পুরস্কার বিতরণী অনুষ্ঠান',
        summary:
          'কৃতী শিক্ষার্থীদের মাঝে বার্ষিক পুরস্কার ও সনদ বিতরণ করা হয়েছে।',
        details:
          '<p>শিক্ষাবর্ষের শ্রেণিভিত্তিক ফলাফল, উপস্থিতি ও সহপাঠক্রমিক অর্জনের ভিত্তিতে কৃতী শিক্ষার্থীদের পুরস্কৃত করা হয়েছে। অনুষ্ঠানে প্রতিটি শ্রেণির প্রথম তিনজন মেধাবী শিক্ষার্থীকে বিশেষ পুরস্কার দেওয়া হয়।</p><p>পরিচালনা পরিষদের সভাপতি বিজয়ীদের অভিনন্দন জানিয়ে বলেন, ধারাবাহিক অধ্যবসায়ই সাফল্যের মূল চাবিকাঠি।</p>',
        imageUrl:
          'https://placehold.co/800x450/0F3151/FFFFFF?text=Prize+Giving',
        publishedAt: new Date('2026-08-16T00:00:00.000Z'),
        isPublished: true,
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(events)
    .values([
      {
        id: '10000000-0000-4000-8000-000000000071',
        schoolId: school.id,
        titleBn: 'অভিভাবক সমাবেশ',
        details: 'অভিভাবক ও শিক্ষকদের মতবিনিময় সভা।',
        venue: 'বিদ্যালয় মিলনায়তন',
        startsAt: new Date(Date.now() + 86400000),
      },
      {
        id: '10000000-0000-4000-8000-000000000072',
        schoolId: school.id,
        titleBn: 'বার্ষিক ক্রীড়া প্রতিযোগিতা',
        details:
          'শিক্ষার্থীদের অংশগ্রহণে দিনব্যাপী বার্ষিক ক্রীড়া প্রতিযোগিতা অনুষ্ঠিত হবে। সকল শিক্ষার্থী ও অভিভাবক আমন্ত্রিত।',
        venue: 'বিদ্যালয় খেলার মাঠ',
        startsAt: new Date('2026-11-14T09:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000073',
        schoolId: school.id,
        titleBn: 'বিজ্ঞান মেলা ও প্রদর্শনী',
        details:
          'বিজ্ঞান ক্লাবের উদ্যোগে শিক্ষার্থীদের উদ্ভাবনী প্রকল্পের প্রদর্শনী অনুষ্ঠিত হয়েছে।',
        venue: 'বিদ্যালয় প্রাঙ্গণ',
        startsAt: new Date('2026-09-18T10:00:00.000Z'),
      },
      {
        id: '10000000-0000-4000-8000-000000000074',
        schoolId: school.id,
        titleBn: 'নবীন বরণ অনুষ্ঠান',
        details:
          'নতুন শিক্ষাবর্ষে ভর্তি হওয়া শিক্ষার্থীদের বরণ অনুষ্ঠান অনুষ্ঠিত হয়েছে।',
        venue: 'বিদ্যালয় মিলনায়তন',
        startsAt: new Date('2026-01-12T10:00:00.000Z'),
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(galleries)
    .values([
      {
        id: '10000000-0000-4000-8000-000000000081',
        schoolId: school.id,
        titleBn: 'বিদ্যালয় প্রাঙ্গণ',
        coverUrl: 'https://placehold.co/640x360/21699D/FFFFFF?text=Gallery',
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000082',
        schoolId: school.id,
        titleBn: 'ক্রীড়া প্রতিযোগিতা',
        coverUrl:
          'https://placehold.co/640x360/1E7A46/FFFFFF?text=Sports+Day',
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000083',
        schoolId: school.id,
        titleBn: 'বিজ্ঞান মেলা',
        coverUrl:
          'https://placehold.co/640x360/0F3151/FFFFFF?text=Science+Fair',
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-000000000084',
        schoolId: school.id,
        titleBn: 'সাংস্কৃতিক অনুষ্ঠান',
        coverUrl:
          'https://placehold.co/640x360/21699D/FFFFFF?text=Cultural+Program',
        isPublished: true,
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(galleryItems)
    .values([
      {
        id: '10000000-0000-4000-8000-000000000091',
        galleryId: '10000000-0000-4000-8000-000000000081',
        imageUrl: 'https://placehold.co/640x360/21699D/FFFFFF?text=School',
        captionBn: 'বিদ্যালয় প্রাঙ্গণ',
        orderIndex: 0,
      },
      {
        id: '10000000-0000-4000-8000-000000000101',
        galleryId: '10000000-0000-4000-8000-000000000081',
        imageUrl:
          'https://placehold.co/640x360/21699D/FFFFFF?text=Main+Building',
        captionBn: 'প্রধান ভবন',
        orderIndex: 1,
      },
      {
        id: '10000000-0000-4000-8000-000000000102',
        galleryId: '10000000-0000-4000-8000-000000000081',
        imageUrl: 'https://placehold.co/640x360/1E7A46/FFFFFF?text=Library',
        captionBn: 'পাঠাগার',
        orderIndex: 2,
      },
      {
        id: '10000000-0000-4000-8000-000000000103',
        galleryId: '10000000-0000-4000-8000-000000000081',
        imageUrl:
          'https://placehold.co/640x360/0F3151/FFFFFF?text=Science+Lab',
        captionBn: 'বিজ্ঞানাগার',
        orderIndex: 3,
      },
      {
        id: '10000000-0000-4000-8000-000000000104',
        galleryId: '10000000-0000-4000-8000-000000000081',
        imageUrl:
          'https://placehold.co/640x360/21699D/FFFFFF?text=Playground',
        captionBn: 'খেলার মাঠ',
        orderIndex: 4,
      },
      {
        id: '10000000-0000-4000-8000-000000000092',
        galleryId: '10000000-0000-4000-8000-000000000082',
        imageUrl: 'https://placehold.co/640x360/1E7A46/FFFFFF?text=Race',
        captionBn: 'দৌড় প্রতিযোগিতা',
        orderIndex: 0,
      },
      {
        id: '10000000-0000-4000-8000-000000000093',
        galleryId: '10000000-0000-4000-8000-000000000082',
        imageUrl: 'https://placehold.co/640x360/21699D/FFFFFF?text=Cricket',
        captionBn: 'ক্রিকেট ম্যাচ',
        orderIndex: 1,
      },
      {
        id: '10000000-0000-4000-8000-000000000094',
        galleryId: '10000000-0000-4000-8000-000000000082',
        imageUrl: 'https://placehold.co/640x360/0F3151/FFFFFF?text=Football',
        captionBn: 'ফুটবল ফাইনাল',
        orderIndex: 2,
      },
      {
        id: '10000000-0000-4000-8000-000000000095',
        galleryId: '10000000-0000-4000-8000-000000000082',
        imageUrl: 'https://placehold.co/640x360/1E7A46/FFFFFF?text=Long+Jump',
        captionBn: 'দীর্ঘ লাফ',
        orderIndex: 3,
      },
      {
        id: '10000000-0000-4000-8000-000000000096',
        galleryId: '10000000-0000-4000-8000-000000000082',
        imageUrl:
          'https://placehold.co/640x360/21699D/FFFFFF?text=Prize+Giving',
        captionBn: 'পুরস্কার বিতরণ',
        orderIndex: 4,
      },
      {
        id: '10000000-0000-4000-8000-000000000097',
        galleryId: '10000000-0000-4000-8000-000000000083',
        imageUrl:
          'https://placehold.co/640x360/0F3151/FFFFFF?text=Solar+Project',
        captionBn: 'সৌরশক্তি প্রকল্প',
        orderIndex: 0,
      },
      {
        id: '10000000-0000-4000-8000-000000000098',
        galleryId: '10000000-0000-4000-8000-000000000083',
        imageUrl:
          'https://placehold.co/640x360/21699D/FFFFFF?text=Water+Filter',
        captionBn: 'পানি পরিশোধন মডেল',
        orderIndex: 1,
      },
      {
        id: '10000000-0000-4000-8000-000000000099',
        galleryId: '10000000-0000-4000-8000-000000000083',
        imageUrl:
          'https://placehold.co/640x360/1E7A46/FFFFFF?text=Smart+Irrigation',
        captionBn: 'স্মার্ট সেচ প্রকল্প',
        orderIndex: 2,
      },
      {
        id: '10000000-0000-4000-8000-00000000009a',
        galleryId: '10000000-0000-4000-8000-000000000083',
        imageUrl: 'https://placehold.co/640x360/0F3151/FFFFFF?text=Judges',
        captionBn: 'বিচারকদের পরিদর্শন',
        orderIndex: 3,
      },
      {
        id: '10000000-0000-4000-8000-00000000009b',
        galleryId: '10000000-0000-4000-8000-000000000083',
        imageUrl: 'https://placehold.co/640x360/21699D/FFFFFF?text=Winners',
        captionBn: 'বিজয়ী দল',
        orderIndex: 4,
      },
      {
        id: '10000000-0000-4000-8000-00000000009c',
        galleryId: '10000000-0000-4000-8000-000000000084',
        imageUrl: 'https://placehold.co/640x360/21699D/FFFFFF?text=Song',
        captionBn: 'সংগীত পরিবেশনা',
        orderIndex: 0,
      },
      {
        id: '10000000-0000-4000-8000-00000000009d',
        galleryId: '10000000-0000-4000-8000-000000000084',
        imageUrl: 'https://placehold.co/640x360/1E7A46/FFFFFF?text=Dance',
        captionBn: 'নৃত্য পরিবেশনা',
        orderIndex: 1,
      },
      {
        id: '10000000-0000-4000-8000-00000000009e',
        galleryId: '10000000-0000-4000-8000-000000000084',
        imageUrl: 'https://placehold.co/640x360/0F3151/FFFFFF?text=Recitation',
        captionBn: 'আবৃত্তি',
        orderIndex: 2,
      },
      {
        id: '10000000-0000-4000-8000-00000000009f',
        galleryId: '10000000-0000-4000-8000-000000000084',
        imageUrl: 'https://placehold.co/640x360/21699D/FFFFFF?text=Drama',
        captionBn: 'নাটিকা',
        orderIndex: 3,
      },
      {
        id: '10000000-0000-4000-8000-0000000000a0',
        galleryId: '10000000-0000-4000-8000-000000000084',
        imageUrl: 'https://placehold.co/640x360/1E7A46/FFFFFF?text=Audience',
        captionBn: 'দর্শক সারি',
        orderIndex: 4,
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(downloads)
    .values([
      {
        id: '10000000-0000-4000-8000-0000000000a1',
        schoolId: school.id,
        titleBn: 'ভর্তি নির্দেশিকা',
        category: 'admission',
        fileUrl: 'https://example.com/admission-guide.pdf',
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000a2',
        schoolId: school.id,
        titleBn: 'ভর্তি ফর্ম',
        category: 'admission',
        fileUrl: 'https://example.com/admission-form.pdf',
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000a3',
        schoolId: school.id,
        titleBn: 'ষষ্ঠ–দশম শ্রেণির সিলেবাস',
        category: 'syllabus',
        fileUrl: 'https://example.com/syllabus-class-6-10.pdf',
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000a4',
        schoolId: school.id,
        titleBn: 'বার্ষিক ছুটির তালিকা ২০২৬',
        category: 'holiday',
        fileUrl: 'https://example.com/holiday-list-2026.pdf',
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000a5',
        schoolId: school.id,
        titleBn: 'ক্লাস রুটিন',
        category: 'routine',
        fileUrl: 'https://example.com/class-routine.pdf',
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000a6',
        schoolId: school.id,
        titleBn: 'প্রবেশপত্র সংক্রান্ত নির্দেশনা',
        category: 'exam',
        fileUrl: 'https://example.com/admit-card-instructions.pdf',
        isPublished: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000a7',
        schoolId: school.id,
        titleBn: 'সিটিজেন চার্টার',
        category: 'compliance',
        fileUrl: 'https://example.com/citizen-charter.pdf',
        isPublished: true,
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(importantLinks)
    .values([
      {
        id: '10000000-0000-4000-8000-0000000000b1',
        schoolId: school.id,
        labelBn: 'বাংলাদেশ শিক্ষা বোর্ড',
        url: 'https://educationboardresults.gov.bd',
        orderIndex: 0,
        isEnabled: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000b2',
        schoolId: school.id,
        labelBn: 'শিক্ষা মন্ত্রণালয়',
        url: 'https://moedu.gov.bd',
        orderIndex: 1,
        isEnabled: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000b3',
        schoolId: school.id,
        labelBn: 'মাধ্যমিক ও উচ্চ শিক্ষা অধিদপ্তর',
        url: 'https://dshe.gov.bd',
        orderIndex: 2,
        isEnabled: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000b4',
        schoolId: school.id,
        labelBn: 'জাতীয় শিক্ষাক্রম ও পাঠ্যপুস্তক বোর্ড (NCTB)',
        url: 'https://nctb.gov.bd',
        orderIndex: 3,
        isEnabled: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000b5',
        schoolId: school.id,
        labelBn: 'বাংলাদেশ শিক্ষাতথ্য ও পরিসংখ্যান ব্যুরো (BANBEIS)',
        url: 'https://banbeis.gov.bd',
        orderIndex: 4,
        isEnabled: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000b6',
        schoolId: school.id,
        labelBn: 'জাতীয় তথ্য বাতায়ন',
        url: 'https://bangladesh.gov.bd',
        orderIndex: 5,
        isEnabled: true,
      },
      {
        id: '10000000-0000-4000-8000-0000000000b7',
        schoolId: school.id,
        labelBn: 'দিনাজপুর শিক্ষা বোর্ড',
        url: 'https://dinajpureducationboard.gov.bd',
        orderIndex: 6,
        isEnabled: true,
      },
    ])
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
  // Extra holidays use explicit ids in a separate series on purpose: the
  // map above builds ids as `…c${index + 1}`, which would produce invalid /
  // colliding suffixes past index 8 — the original 8 ids (…c1–c8) must stay
  // byte-identical, so these are NOT appended to holidayValues.
  const extraHolidayValues = [
    {
      id: '10000000-0000-4000-8000-000000000201',
      titleBn: 'শ্রী শ্রী সরস্বতী পূজা',
      fromDate: '2026-01-23',
      toDate: '2026-01-23',
    },
    {
      id: '10000000-0000-4000-8000-000000000202',
      titleBn: 'পবিত্র শবে বরাত',
      fromDate: '2026-02-03',
      toDate: '2026-02-03',
    },
    {
      id: '10000000-0000-4000-8000-000000000203',
      titleBn: 'পবিত্র শবে কদর',
      fromDate: '2026-03-16',
      toDate: '2026-03-16',
    },
    {
      id: '10000000-0000-4000-8000-000000000204',
      titleBn: 'জুমাতুল বিদা',
      fromDate: '2026-03-20',
      toDate: '2026-03-20',
    },
    {
      id: '10000000-0000-4000-8000-000000000205',
      titleBn: 'বুদ্ধ পূর্ণিমা',
      fromDate: '2026-05-20',
      toDate: '2026-05-20',
    },
    {
      id: '10000000-0000-4000-8000-000000000206',
      titleBn: 'গ্রীষ্মকালীন ছুটি',
      fromDate: '2026-06-01',
      toDate: '2026-06-15',
    },
    {
      id: '10000000-0000-4000-8000-000000000207',
      titleBn: 'পবিত্র আশুরা',
      fromDate: '2026-06-26',
      toDate: '2026-06-26',
    },
    {
      id: '10000000-0000-4000-8000-000000000208',
      titleBn: 'পবিত্র ঈদে মিলাদুন্নবী (সা.)',
      fromDate: '2026-08-26',
      toDate: '2026-08-26',
    },
    {
      id: '10000000-0000-4000-8000-000000000209',
      titleBn: 'দুর্গাপূজা (বিজয়া দশমী)',
      fromDate: '2026-10-20',
      toDate: '2026-10-20',
    },
    {
      id: '10000000-0000-4000-8000-00000000020a',
      titleBn: 'শীতকালীন ছুটি',
      fromDate: '2026-12-20',
      toDate: '2026-12-31',
    },
  ] as const;
  await db
    .insert(holidays)
    .values(
      extraHolidayValues.map((row) => ({
        ...row,
        schoolId: school.id,
        isPublished: true,
      })),
    )
    .onConflictDoNothing();
  progress('holidays', holidayValues.length + extraHolidayValues.length);
  const videoValues = [
    'বার্ষিক ক্রীড়া প্রতিযোগিতা',
    'বিজ্ঞান মেলা ও প্রদর্শনী',
    'বার্ষিক সাংস্কৃতিক অনুষ্ঠান',
    'মিলাদ ও দোয়া মাহফিল',
    'নবীন বরণ ও ওরিয়েন্টেশন',
    'শিক্ষা সফর ২০২৬',
    'বার্ষিক পুরস্কার বিতরণী',
    'জাতীয় দিবসের আলোচনা সভা',
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
    ['আলহাজ্ব মোঃ আব্দুর রহিম', 'দাতা সদস্য'],
    ['অধ্যাপক মোঃ জাহাঙ্গীর আলম', 'বিদ্যোৎসাহী সদস্য'],
    ['মোসাঃ ফেরদৌসী বেগম', 'মহিলা অভিভাবক সদস্য'],
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
  // The demo-login (credential) students are all in class 10, which the fee
  // event above does not cover — so their student-portal fee screen would be
  // empty. Add a class-10 charge to the same event and dues for every
  // credential student, matched by registration number (never by row
  // order): first login PAID with receipt RC-2026-000002, second PARTIAL,
  // the rest DUE.
  const demoClassRow = classValues[4]!; // শ্রেণি ১০
  await db
    .insert(feeEventClasses)
    .values({
      id: fixedUuid(15003),
      feeEventId,
      classId: demoClassRow.id,
      amount: 70000,
    })
    .onConflictDoNothing();
  const credentialRegSet = new Set(login.students);
  const studentRegRows = await db
    .select({
      studentId: students.id,
      registrationNumber: users.registrationNumber,
    })
    .from(students)
    .innerJoin(users, eq(students.userId, users.id))
    .where(eq(students.schoolId, school.id));
  const demoStudentIds = studentRegRows
    .filter(
      (row) =>
        row.registrationNumber !== null &&
        credentialRegSet.has(row.registrationNumber),
    )
    .sort((a, b) =>
      (a.registrationNumber ?? '').localeCompare(b.registrationNumber ?? ''),
    )
    .map((row) => row.studentId);
  const demoDues = demoStudentIds.map((studentId, index) => ({
    schoolId: school.id,
    feeEventId,
    studentId,
    amount: 70000,
    paidAmount: index === 0 ? 70000 : index === 1 ? 30000 : 0,
    dueDate: '2026-10-10',
    status: index === 0 ? 'PAID' : index === 1 ? 'PARTIAL' : 'DUE',
  }));
  if (demoDues.length > 0) {
    await db.insert(studentFees).values(demoDues).onConflictDoNothing();
    const demoPaidDue = demoDues[0]!;
    const [existingDemoReceipt] = await db
      .select()
      .from(receipts)
      .where(eq(receipts.receiptNumber, 'RC-2026-000002'))
      .limit(1);
    if (!existingDemoReceipt) {
      const [demoReceipt] = await db
        .insert(receipts)
        .values({
          schoolId: school.id,
          receiptNumber: 'RC-2026-000002',
          verifyCode: 'DEMO20260002',
        })
        .returning();
      if (demoReceipt) {
        const [savedDemoDue] = await db
          .select()
          .from(studentFees)
          .where(
            and(
              eq(studentFees.feeEventId, feeEventId),
              eq(studentFees.studentId, demoPaidDue.studentId),
            ),
          )
          .limit(1);
        if (savedDemoDue)
          await db.insert(payments).values({
            schoolId: school.id,
            studentFeeId: savedDemoDue.id,
            studentId: savedDemoDue.studentId,
            amount: 70000,
            method: 'ক্যাশ',
            paidAt: '2026-10-06',
            collectedBy: markedBy,
            receiptId: demoReceipt.id,
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
    admissionRows.length + seededDues.length + demoDues.length,
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
