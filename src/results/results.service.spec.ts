import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { makeFakeDb, type FakeRow } from '../testing/fake-db.js';

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../db/index.js', () => ({
  createDb: () => holder.current,
}));

import { ResultsService } from './results.service.js';
import type { AuthUser } from '../auth/auth.types.js';

const admin = {
  id: 'admin-1',
  schoolId: 'school-1',
  role: 'ADMIN',
  displayNameBn: 'প্রশাসক',
} as AuthUser;

function setup(seed: Record<string, FakeRow[]>) {
  const fake = makeFakeDb(seed);
  holder.current = fake.db;
  return { service: new ResultsService(), fake };
}

describe('ResultsService.publicSearch (B1 contract)', () => {
  it('unknown registration -> STUDENT_NOT_FOUND', async () => {
    const { service } = setup({ students: [] });
    await expect(
      service.publicSearch('school-1', '99999999'),
    ).resolves.toEqual({ data: null, status: 'STUDENT_NOT_FOUND' });
  });

  it('known student without a published result -> NO_PUBLISHED_RESULT', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', registrationNumber: '26100001' }],
      results: [],
    });
    await expect(
      service.publicSearch('school-1', '26100001'),
    ).resolves.toEqual({ data: null, status: 'NO_PUBLISHED_RESULT' });
  });

  it('known student with a published result -> FOUND with the result', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', registrationNumber: '26100001' }],
      results: [
        {
          result: { id: 'r-1', gpa: '5.00', letter: 'A+' },
          exam: { id: 'e-1', nameBn: 'অর্ধ-বার্ষিক' },
        },
      ],
    });
    const response = await service.publicSearch('school-1', '26100001');
    expect(response.status).toBe('FOUND');
    expect(response.data).toMatchObject({ result: { gpa: '5.00' } });
  });
});

describe('ResultsService.createExam / updateExam (B10)', () => {
  it('create rejects publishAt before endsAt', async () => {
    const { service } = setup({});
    await expect(
      service.createExam(admin, {
        nameBn: 'বার্ষিক পরীক্ষা',
        startsAt: '2026-12-01',
        endsAt: '2026-12-15',
        publishAt: '2026-11-20',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create accepts publishAt after endsAt', async () => {
    const { service, fake } = setup({});
    await service.createExam(admin, {
      nameBn: 'বার্ষিক পরীক্ষা',
      startsAt: '2026-12-01',
      endsAt: '2026-12-15',
      publishAt: '2026-12-20',
    });
    expect(fake.inserted.map((row) => row.table)).toEqual(['exams']);
  });

  it('update rejects merging a stored endsAt with an earlier publishAt', async () => {
    const { service } = setup({
      exams: [{ id: 'e-1', schoolId: 'school-1', endsAt: '2026-12-15', publishAt: null }],
    });
    await expect(
      service.updateExam(admin, 'e-1', { publishAt: '2026-11-20' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ResultsService.student (B1)', () => {
  it('returns the token owner results resolved via the student row', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', userId: 'user-1', schoolId: 'school-real' }],
      results: [
        {
          result: { id: 'r-1', studentId: 'st-1', gpa: '5.00' },
          exam: { id: 'e-1', nameBn: 'অর্ধ-বার্ষিক' },
        },
      ],
      result_subjects: [],
    });
    const studentUser = {
      id: 'user-1',
      schoolId: 'school-WRONG',
      role: 'STUDENT',
      displayNameBn: 'আরিফুল ইসলাম',
    } as AuthUser;
    const { data } = await service.student(studentUser);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ result: { gpa: '5.00' }, subjects: [] });
  });
});

describe('ResultsService.studentResults (Round 9 profile results tab)', () => {
  it('returns every processed result with its marksheet subjects, published or not', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', schoolId: 'school-1' }],
      // Joined shape of the main query: { result, exam, sessionName }.
      results: [
        {
          result: {
            id: 'r-1',
            studentId: 'st-1',
            totalMarks: 512,
            gpa: '4.56',
            letter: 'A',
            isPassed: true,
            meritPosition: 3,
          },
          exam: { id: 'e-1', nameBn: 'অর্ধ-বার্ষিক', isPublished: false },
          sessionName: '২০২৬ শিক্ষাবর্ষ',
        },
      ],
      // Joined shape of the subject query (result_subjects ⋈ exam_subjects
      // ⋈ subjects ⟕ marks).
      result_subjects: [
        {
          nameBn: 'বাংলা',
          totalMarks: 82,
          letter: 'A+',
          gpa: '5.00',
          isAbsent: false,
          fullMarks: 100,
          passMarks: 33,
          cqMarks: 70,
          mcqMarks: 30,
          practicalMarks: 0,
          cq: 60,
          mcq: 22,
          practical: 0,
        },
      ],
    });
    const { data } = await service.studentResults(admin, 'st-1');
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      result: { gpa: '4.56', letter: 'A', isPassed: true },
      exam: { nameBn: 'অর্ধ-বার্ষিক', isPublished: false },
      sessionName: '২০২৬ শিক্ষাবর্ষ',
    });
    expect(data[0]?.subjects).toHaveLength(1);
    expect(data[0]?.subjects[0]).toMatchObject({
      nameBn: 'বাংলা',
      totalMarks: 82,
      cq: 60,
      mcq: 22,
    });
  });

  it('returns an empty list for a student with no processed results', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', schoolId: 'school-1' }],
      results: [],
      result_subjects: [],
    });
    await expect(service.studentResults(admin, 'st-1')).resolves.toEqual({
      data: [],
    });
  });

  it('throws NotFound when the student is not in the caller school', async () => {
    const { service } = setup({ students: [] });
    await expect(
      service.studentResults(admin, 'st-other-school'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
