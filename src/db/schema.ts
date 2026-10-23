import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['ADMIN', 'TEACHER', 'STUDENT']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const schools = pgTable(
  'schools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nameBn: text('name_bn').notNull(),
    nameEn: text('name_en').notNull(),
    eiin: text('eiin').notNull(),
    address: text('address').notNull().default(''),
    foundedYear: text('founded_year'),
    logoUrl: text('logo_url'),
    phone: text('phone'),
    email: text('email'),
    themeColor: text('theme_color').notNull().default('#21699D'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex('schools_eiin_unique').on(table.eiin)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    role: userRole('role').notNull(),
    username: text('username'),
    email: text('email'),
    passwordHash: text('password_hash'),
    registrationNumber: text('registration_number'),
    displayNameBn: text('display_name_bn').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_school_username_unique').on(
      table.schoolId,
      table.username,
    ),
    uniqueIndex('users_school_email_unique').on(table.schoolId, table.email),
    uniqueIndex('users_registration_number_unique').on(
      table.registrationNumber,
    ),
  ],
);

export const settings = pgTable(
  'settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('settings_school_key_unique').on(table.schoolId, table.key),
  ],
);

const contentTimestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
};
export const homepageBlocks = pgTable(
  'homepage_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    key: text('key').notNull(),
    titleBn: text('title_bn').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    isEnabled: boolean('is_enabled').notNull().default(true),
    config: jsonb('config').notNull().default({}),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('homepage_blocks_school_key_unique').on(t.schoolId, t.key),
  ],
);
export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    slug: text('slug').notNull(),
    titleBn: text('title_bn').notNull(),
    titleEn: text('title_en'),
    excerpt: text('excerpt'),
    body: text('body').notNull().default(''),
    isPublished: boolean('is_published').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...contentTimestamps,
  },
  (t) => [uniqueIndex('pages_school_slug_unique').on(t.schoolId, t.slug)],
);
export const menus = pgTable('menus', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  ...contentTimestamps,
});
export const menuItems = pgTable('menu_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  menuId: uuid('menu_id')
    .notNull()
    .references(() => menus.id),
  parentId: uuid('parent_id'),
  labelBn: text('label_bn').notNull(),
  href: text('href').notNull(),
  kind: text('kind').notNull().default('page'),
  orderIndex: integer('order_index').notNull().default(0),
  isVisible: boolean('is_visible').notNull().default(true),
  ...contentTimestamps,
});
export const serviceBoxes = pgTable('service_boxes', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  titleBn: text('title_bn').notNull(),
  icon: text('icon').notNull().default('grid'),
  orderIndex: integer('order_index').notNull().default(0),
  isEnabled: boolean('is_enabled').notNull().default(true),
  ...contentTimestamps,
});
export const serviceBoxLinks = pgTable('service_box_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceBoxId: uuid('service_box_id')
    .notNull()
    .references(() => serviceBoxes.id),
  labelBn: text('label_bn').notNull(),
  href: text('href').notNull(),
  kind: text('kind').notNull().default('page'),
  orderIndex: integer('order_index').notNull().default(0),
  ...contentTimestamps,
});
export const banners = pgTable('banners', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  imageUrl: text('image_url').notNull(),
  titleBn: text('title_bn').notNull(),
  captionBn: text('caption_bn'),
  href: text('href'),
  orderIndex: integer('order_index').notNull().default(0),
  isEnabled: boolean('is_enabled').notNull().default(true),
  ...contentTimestamps,
});
export const notices = pgTable('notices', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  titleBn: text('title_bn').notNull(),
  details: text('details').notNull().default(''),
  category: text('category').notNull().default('general'),
  attachmentUrl: text('attachment_url'),
  isPinned: boolean('is_pinned').notNull().default(false),
  showTicker: boolean('show_ticker').notNull().default(true),
  publishAt: timestamp('publish_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  audience: text('audience').notNull().default('public'),
  audienceClass: text('audience_class'),
  isPublished: boolean('is_published').notNull().default(false),
  ...contentTimestamps,
});
export const news = pgTable('news', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  titleBn: text('title_bn').notNull(),
  summary: text('summary').notNull().default(''),
  details: text('details').notNull().default(''),
  imageUrl: text('image_url'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  isPublished: boolean('is_published').notNull().default(false),
  ...contentTimestamps,
});
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  titleBn: text('title_bn').notNull(),
  details: text('details').notNull().default(''),
  venue: text('venue'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  ...contentTimestamps,
});
export const galleries = pgTable('galleries', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  titleBn: text('title_bn').notNull(),
  coverUrl: text('cover_url'),
  isPublished: boolean('is_published').notNull().default(false),
  ...contentTimestamps,
});
export const galleryItems = pgTable('gallery_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  galleryId: uuid('gallery_id')
    .notNull()
    .references(() => galleries.id),
  imageUrl: text('image_url').notNull(),
  captionBn: text('caption_bn'),
  orderIndex: integer('order_index').notNull().default(0),
  ...contentTimestamps,
});
export const downloads = pgTable('downloads', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  titleBn: text('title_bn').notNull(),
  category: text('category').notNull().default('general'),
  fileUrl: text('file_url').notNull(),
  isPublished: boolean('is_published').notNull().default(false),
  ...contentTimestamps,
});
export const importantLinks = pgTable('important_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  labelBn: text('label_bn').notNull(),
  url: text('url').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  isEnabled: boolean('is_enabled').notNull().default(true),
  ...contentTimestamps,
});
export const holidays = pgTable('holidays', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  titleBn: text('title_bn').notNull(),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  isPublished: boolean('is_published').notNull().default(false),
  ...contentTimestamps,
});
export const videos = pgTable('videos', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  titleBn: text('title_bn').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  videoUrl: text('video_url').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  isPublished: boolean('is_published').notNull().default(false),
  ...contentTimestamps,
});
export const committee = pgTable('committee_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  nameBn: text('name_bn').notNull(),
  roleBn: text('role_bn').notNull(),
  photoUrl: text('photo_url'),
  orderIndex: integer('order_index').notNull().default(0),
  isPublished: boolean('is_published').notNull().default(false),
  ...contentTimestamps,
});
export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  textBn: text('text_bn').notNull(),
  authorBn: text('author_bn'),
  isEnabled: boolean('is_enabled').notNull().default(true),
  ...contentTimestamps,
});
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  personNameBn: text('person_name_bn').notNull(),
  designationBn: text('designation_bn').notNull(),
  photoUrl: text('photo_url'),
  body: text('body').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  isEnabled: boolean('is_enabled').notNull().default(true),
  ...contentTimestamps,
});
export const contactMessages = pgTable('contact_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  name: text('name').notNull(),
  mobile: text('mobile').notNull(),
  email: text('email'),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('unread'),
  ...contentTimestamps,
});
export const complaints = pgTable('complaints', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  name: text('name').notNull(),
  mobile: text('mobile').notNull(),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('received'),
  ...contentTimestamps,
});

export const academicSessions = pgTable(
  'academic_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    name: text('name').notNull(),
    year: integer('year').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('academic_sessions_school_year_unique').on(t.schoolId, t.year),
  ],
);
export const academicClasses = pgTable('academic_classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  nameBn: text('name_bn').notNull(),
  nameEn: text('name_en'),
  orderIndex: integer('order_index').notNull().default(0),
  ...contentTimestamps,
});
export const sections = pgTable('sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  classId: uuid('class_id')
    .notNull()
    .references(() => academicClasses.id),
  nameBn: text('name_bn').notNull(),
  shift: text('shift').notNull().default('দিন'),
  groupName: text('group_name'),
  ...contentTimestamps,
});
export const subjects = pgTable('subjects', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  nameBn: text('name_bn').notNull(),
  code: text('code'),
  fullMarks: integer('full_marks').notNull().default(100),
  cqMarks: integer('cq_marks').notNull().default(0),
  mcqMarks: integer('mcq_marks').notNull().default(0),
  practicalMarks: integer('practical_marks').notNull().default(0),
  orderIndex: integer('order_index').notNull().default(0),
  ...contentTimestamps,
});
export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    sessionId: uuid('session_id').references(() => academicSessions.id),
    classId: uuid('class_id').references(() => academicClasses.id),
    sectionId: uuid('section_id').references(() => sections.id),
    roll: integer('roll'),
    nameEn: text('name_en'),
    fatherNameBn: text('father_name_bn'),
    motherNameBn: text('mother_name_bn'),
    dateOfBirth: text('date_of_birth'),
    birthCertificateNumber: text('birth_certificate_number'),
    gender: text('gender'),
    religion: text('religion'),
    bloodGroup: text('blood_group'),
    guardianMobile: text('guardian_mobile'),
    presentAddress: text('present_address'),
    permanentAddress: text('permanent_address'),
    previousInstitution: text('previous_institution'),
    admissionDate: text('admission_date'),
    photoUrl: text('photo_url'),
    isActive: boolean('is_active').notNull().default(true),
    ...contentTimestamps,
  },
  (t) => [uniqueIndex('students_school_user_unique').on(t.schoolId, t.userId)],
);
export const teachers = pgTable(
  'teachers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    teacherCode: text('teacher_code').notNull(),
    nameEn: text('name_en'),
    designation: text('designation').notNull().default('সহকারী শিক্ষক'),
    qualification: text('qualification'),
    mobile: text('mobile'),
    nid: text('nid'),
    joiningDate: text('joining_date'),
    monthlySalary: integer('monthly_salary').notNull().default(0),
    photoUrl: text('photo_url'),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('teachers_school_code_unique').on(t.schoolId, t.teacherCode),
  ],
);
export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  nameBn: text('name_bn').notNull(),
  designation: text('designation').notNull(),
  mobile: text('mobile'),
  ...contentTimestamps,
});
export const subjectAssignments = pgTable('subject_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  teacherId: uuid('teacher_id')
    .notNull()
    .references(() => teachers.id),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id),
  classId: uuid('class_id')
    .notNull()
    .references(() => academicClasses.id),
  sectionId: uuid('section_id').references(() => sections.id),
  ...contentTimestamps,
});
export const routineEntries = pgTable(
  'routine_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    teacherId: uuid('teacher_id').references(() => teachers.id),
    subjectId: uuid('subject_id').references(() => subjects.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => academicClasses.id),
    sectionId: uuid('section_id').references(() => sections.id),
    dayOfWeek: integer('day_of_week').notNull(),
    period: integer('period').notNull(),
    room: text('room'),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('routine_school_class_section_slot_unique').on(
      t.schoolId,
      t.classId,
      t.sectionId,
      t.dayOfWeek,
      t.period,
    ),
  ],
);
export const attendance = pgTable(
  'attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => academicSessions.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => academicClasses.id),
    sectionId: uuid('section_id').references(() => sections.id),
    attendanceDate: text('attendance_date').notNull(),
    status: text('status').notNull().default('PRESENT'),
    markedBy: uuid('marked_by')
      .notNull()
      .references(() => users.id),
    note: text('note'),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('attendance_student_date_unique').on(
      t.studentId,
      t.attendanceDate,
    ),
  ],
);
export const teacherAttendance = pgTable(
  'teacher_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id),
    attendanceDate: text('attendance_date').notNull(),
    status: text('status').notNull().default('PRESENT'),
    markedBy: uuid('marked_by')
      .notNull()
      .references(() => users.id),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('teacher_attendance_date_unique').on(
      t.teacherId,
      t.attendanceDate,
    ),
  ],
);
export const gradingScales = pgTable('grading_scales', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  minMarks: integer('min_marks').notNull(),
  maxMarks: integer('max_marks').notNull(),
  letter: text('letter').notNull(),
  gpa: text('gpa').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  ...contentTimestamps,
});
export const exams = pgTable('exams', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => academicSessions.id),
  classId: uuid('class_id')
    .notNull()
    .references(() => academicClasses.id),
  nameBn: text('name_bn').notNull(),
  examType: text('exam_type').notNull().default('other'),
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
  isPublished: boolean('is_published').notNull().default(false),
  publishAt: timestamp('publish_at', { withTimezone: true }),
  countdownEnabled: boolean('countdown_enabled').notNull().default(false),
  failAnySubject: boolean('fail_any_subject').notNull().default(true),
  ...contentTimestamps,
});
export const examSubjects = pgTable('exam_subjects', {
  id: uuid('id').primaryKey().defaultRandom(),
  examId: uuid('exam_id')
    .notNull()
    .references(() => exams.id),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id),
  fullMarks: integer('full_marks').notNull(),
  passMarks: integer('pass_marks').notNull(),
  cqMarks: integer('cq_marks').notNull().default(0),
  mcqMarks: integer('mcq_marks').notNull().default(0),
  practicalMarks: integer('practical_marks').notNull().default(0),
  ...contentTimestamps,
});
export const marks = pgTable(
  'marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    examSubjectId: uuid('exam_subject_id')
      .notNull()
      .references(() => examSubjects.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    teacherId: uuid('teacher_id').references(() => teachers.id),
    cq: integer('cq'),
    mcq: integer('mcq'),
    practical: integer('practical'),
    total: integer('total').notNull().default(0),
    isAbsent: boolean('is_absent').notNull().default(false),
    isSubmitted: boolean('is_submitted').notNull().default(false),
    isLocked: boolean('is_locked').notNull().default(false),
    approvedBy: uuid('approved_by').references(() => users.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('marks_exam_subject_student_unique').on(
      t.examSubjectId,
      t.studentId,
    ),
  ],
);
export const results = pgTable(
  'results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => academicClasses.id),
    totalMarks: integer('total_marks').notNull().default(0),
    gpa: text('gpa').notNull().default('0.00'),
    letter: text('letter').notNull().default('F'),
    isPassed: boolean('is_passed').notNull().default(false),
    meritPosition: integer('merit_position'),
    remarks: text('remarks'),
    ...contentTimestamps,
  },
  (t) => [uniqueIndex('results_exam_student_unique').on(t.examId, t.studentId)],
);
export const resultSubjects = pgTable('result_subjects', {
  id: uuid('id').primaryKey().defaultRandom(),
  resultId: uuid('result_id')
    .notNull()
    .references(() => results.id),
  examSubjectId: uuid('exam_subject_id')
    .notNull()
    .references(() => examSubjects.id),
  totalMarks: integer('total_marks').notNull().default(0),
  letter: text('letter').notNull().default('F'),
  gpa: text('gpa').notNull().default('0.00'),
  isAbsent: boolean('is_absent').notNull().default(false),
  ...contentTimestamps,
});

export const admissionSettings = pgTable(
  'admission_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    isOpen: boolean('is_open').notNull().default(false),
    opensAt: timestamp('opens_at', { withTimezone: true }),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    fields: jsonb('fields').notNull().default([]),
    seatCounts: jsonb('seat_counts').notNull().default({}),
    ...contentTimestamps,
  },
  (t) => [uniqueIndex('admission_settings_school_unique').on(t.schoolId)],
);
export const admissionApplications = pgTable(
  'admission_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    trackingId: text('tracking_id').notNull(),
    status: text('status').notNull().default('PENDING'),
    admissionClassId: uuid('admission_class_id').references(
      () => academicClasses.id,
    ),
    preferredSectionId: uuid('preferred_section_id').references(
      () => sections.id,
    ),
    sessionId: uuid('session_id').references(() => academicSessions.id),
    applicant: jsonb('applicant').notNull().default({}),
    photoUrl: text('photo_url'),
    documentUrls: jsonb('document_urls').notNull().default([]),
    reviewNote: text('review_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    studentId: uuid('student_id').references(() => students.id),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('admission_applications_school_tracking_unique').on(
      t.schoolId,
      t.trackingId,
    ),
  ],
);
export const feeEvents = pgTable('fee_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  nameBn: text('name_bn').notNull(),
  type: text('type').notNull(),
  description: text('description').notNull().default(''),
  dueDate: text('due_date').notNull(),
  lateFee: integer('late_fee').notNull().default(0),
  isPublished: boolean('is_published').notNull().default(false),
  copiedFromId: uuid('copied_from_id'),
  ...contentTimestamps,
});
export const feeEventClasses = pgTable(
  'fee_event_classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feeEventId: uuid('fee_event_id')
      .notNull()
      .references(() => feeEvents.id),
    classId: uuid('class_id')
      .notNull()
      .references(() => academicClasses.id),
    amount: integer('amount').notNull(),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('fee_event_classes_event_class_unique').on(
      t.feeEventId,
      t.classId,
    ),
  ],
);
export const studentFees = pgTable(
  'student_fees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    feeEventId: uuid('fee_event_id')
      .notNull()
      .references(() => feeEvents.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    amount: integer('amount').notNull(),
    paidAmount: integer('paid_amount').notNull().default(0),
    dueDate: text('due_date').notNull(),
    status: text('status').notNull().default('DUE'),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('student_fees_event_student_unique').on(
      t.feeEventId,
      t.studentId,
    ),
  ],
);
export const receipts = pgTable(
  'receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    receiptNumber: text('receipt_number').notNull(),
    verifyCode: text('verify_code').notNull(),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('receipts_school_number_unique').on(
      t.schoolId,
      t.receiptNumber,
    ),
    uniqueIndex('receipts_verify_code_unique').on(t.verifyCode),
  ],
);
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  studentFeeId: uuid('student_fee_id')
    .notNull()
    .references(() => studentFees.id),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id),
  amount: integer('amount').notNull(),
  method: text('method').notNull(),
  paidAt: text('paid_at').notNull(),
  collectedBy: uuid('collected_by')
    .notNull()
    .references(() => users.id),
  receiptId: uuid('receipt_id')
    .notNull()
    .references(() => receipts.id),
  ...contentTimestamps,
});
export const salaryRecords = pgTable(
  'salary_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id),
    salaryMonth: text('salary_month').notNull(),
    basic: integer('basic').notNull().default(0),
    allowances: integer('allowances').notNull().default(0),
    deductions: integer('deductions').notNull().default(0),
    net: integer('net').notNull().default(0),
    status: text('status').notNull().default('UNPAID'),
    paidAt: text('paid_at'),
    method: text('method'),
    receiptNumber: text('receipt_number'),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('salary_records_teacher_month_unique').on(
      t.teacherId,
      t.salaryMonth,
    ),
  ],
);
export const ledgerCategories = pgTable(
  'ledger_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    nameBn: text('name_bn').notNull(),
    type: text('type').notNull(),
    ...contentTimestamps,
  },
  (t) => [
    uniqueIndex('ledger_categories_school_name_type_unique').on(
      t.schoolId,
      t.nameBn,
      t.type,
    ),
  ],
);
export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  schoolId: uuid('school_id')
    .notNull()
    .references(() => schools.id),
  categoryId: uuid('category_id').references(() => ledgerCategories.id),
  type: text('type').notNull(),
  amount: integer('amount').notNull(),
  entryDate: text('entry_date').notNull(),
  description: text('description').notNull().default(''),
  sourceType: text('source_type'),
  sourceId: uuid('source_id'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  ...contentTimestamps,
});

export type School = typeof schools.$inferSelect;
export type NewSchool = typeof schools.$inferInsert;
export type User = typeof users.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type HomepageBlock = typeof homepageBlocks.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Notice = typeof notices.$inferSelect;
