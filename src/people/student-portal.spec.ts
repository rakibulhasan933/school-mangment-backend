import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb, type FakeRow } from '../testing/fake-db.js';

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../db/index.js', () => ({
  createDb: () => holder.current,
}));

import { StudentPortalController } from './student-portal.controller.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';

/**
 * B1 regression proof with a seeded-shape student (mirrors the demo
 * seed: reg 26100001, class 10, paid fee + receipt, October attendance).
 * The token deliberately carries a DIFFERENT schoolId than the student
 * row — the live drift that emptied every portal screen.
 */
const studentRow: FakeRow = {
  id: 'student-1',
  schoolId: 'school-real',
  userId: 'user-1',
  sessionId: 'session-1',
  classId: 'class-10',
  sectionId: 'section-1',
  roll: 1,
  fatherNameBn: 'মো. করিম ইসলাম',
  motherNameBn: 'মোসা. রহিমা বেগম',
  guardianMobile: '01700000000',
  classNameBn: 'শ্রেণি ১০',
  sectionNameBn: 'শাখা ক',
  sessionName: '২০২৬ শিক্ষাবর্ষ',
};
const userRow: FakeRow = {
  id: 'user-1',
  schoolId: 'school-WRONG',
  role: 'STUDENT',
  registrationNumber: '26100001',
  displayNameBn: 'আরিফুল ইসলাম',
  isActive: true,
};

function setup(seed: Record<string, FakeRow[]>) {
  const fake = makeFakeDb(seed);
  holder.current = fake.db;
  const controller = new StudentPortalController();
  const request = {
    user: {
      id: 'user-1',
      schoolId: 'school-WRONG',
      role: 'STUDENT',
      displayNameBn: 'আরিফুল ইসলাম',
    },
  } as unknown as AuthenticatedRequest;
  return { controller, request, fake };
}

describe('StudentPortalController (B1)', () => {
  beforeEach(() => {
    holder.current = null;
  });

  it('profile returns the token owner identity even when the token school drifted', async () => {
    const { controller, request } = setup({
      students: [studentRow],
      users: [userRow],
    });
    const { data } = await controller.profile(request);
    expect(data).not.toBeNull();
    expect(data!.student.id).toBe('student-1');
    expect(data!.student.fatherNameBn).toBe('মো. করিম ইসলাম');
    expect(data!.user.registrationNumber).toBe('26100001');
    expect(data!.user.displayNameBn).toBe('আরিফুল ইসলাম');
    expect(data!.classNameBn).toBe('শ্রেণি ১০');
  });

  it('attendance returns the student rows for the month', async () => {
    const rows = [
      { id: 'a1', studentId: 'student-1', attendanceDate: '2026-10-01', status: 'PRESENT' },
      { id: 'a2', studentId: 'student-1', attendanceDate: '2026-10-02', status: 'PRESENT' },
      { id: 'a3', studentId: 'student-1', attendanceDate: '2026-10-04', status: 'ABSENT' },
    ];
    const { controller, request } = setup({
      students: [studentRow],
      users: [userRow],
      attendance: rows,
    });
    const { data } = await controller.attendanceForStudent(request, '2026-10');
    expect(data).toHaveLength(3);
  });

  it('dashboard aggregates dues + attendance + notices from the student school', async () => {
    const { controller, request } = setup({
      students: [studentRow],
      users: [userRow],
      student_fees: [
        { id: 'f1', amount: 70000, paidAmount: 70000, status: 'PAID' },
        { id: 'f2', amount: 60000, paidAmount: 50000, status: 'PAID' },
      ],
      attendance: [
        { status: 'PRESENT' },
        { status: 'PRESENT' },
        { status: 'ABSENT' },
        { status: 'PRESENT' },
      ],
      academic_classes: [{ id: 'class-10', nameBn: 'শ্রেণি ১০' }],
      notices: [
        { id: 'n1', titleBn: 'বিজ্ঞপ্তি', audience: 'public', audienceClass: null, isPinned: false },
      ],
      exams: [],
      results: [
        {
          examNameBn: 'অর্ধ-বার্ষিক',
          gpa: '5.00',
          letter: 'A+',
          isPassed: true,
          totalMarks: 480,
          meritPosition: 1,
        },
      ],
    });
    const { data } = await controller.dashboard(request);
    expect(data).not.toBeNull();
    expect(data!.dues.totalDue).toBe(130000);
    expect(data!.dues.totalPaid).toBe(120000);
    expect(data!.dues.outstanding).toBe(10000);
    // f2 stored status claims PAID but 50000 < 60000 — derived count says 1 unpaid.
    expect(data!.dues.unpaidCount).toBe(1);
    expect(data!.attendance).toEqual({
      total: 4,
      present: 3,
      absent: 1,
      percentage: 75,
    });
    expect(data!.noticeCount).toBe(1);
    expect(data!.latestResult?.gpa).toBe('5.00');
  });

  it('notices exclude staff-only audiences for students', async () => {
    const { controller, request } = setup({
      students: [studentRow],
      users: [userRow],
      academic_classes: [{ id: 'class-10', nameBn: 'শ্রেণি ১০' }],
      notices: [
        { id: 'n1', titleBn: 'সবার জন্য', audience: 'public', audienceClass: null, isPinned: false },
        { id: 'n2', titleBn: 'শুধু শিক্ষক', audience: 'teachers', audienceClass: null, isPinned: false },
      ],
    });
    const { data } = await controller.noticesForStudent(request);
    expect(data.map((row) => row.id)).toEqual(['n1']);
  });
});
