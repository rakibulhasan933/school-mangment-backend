import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { makeFakeDb, type FakeRow } from '../testing/fake-db.js';

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../db/index.js', () => ({
  createDb: () => holder.current,
}));

import { PeopleService } from './people.service.js';
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
  return { service: new PeopleService(), fake };
}

describe('PeopleService.createStudent (B2)', () => {
  it('persists every field the admin form collects', async () => {
    const { service, fake } = setup({
      academic_sessions: [{ id: 'sess-1', year: 2026 }],
      academic_classes: [{ id: 'cls-6', orderIndex: 1 }],
      users: [],
    });
    const { data } = await service.createStudent(admin, {
      displayNameBn: 'আরিফ হোসেন',
      sessionId: 'sess-1',
      classId: 'cls-6',
      sectionId: 'sec-1',
      roll: 99,
      fatherNameBn: 'মো. করিম হোসেন',
      motherNameBn: 'মোসা. ফাতেমা বেগম',
      dateOfBirth: '2014-05-11',
      gender: 'ছেলে',
      religion: 'ইসলাম',
      bloodGroup: 'B+',
      presentAddress: 'কুড়িগ্রাম সদর',
      permanentAddress: 'উলিপুর, কুড়িগ্রাম',
      birthCertificateNumber: '201412345678',
      guardianMobile: '01712345679',
    });
    const studentInsert = fake.inserted.find((row) => row.table === 'students');
    expect(studentInsert).toBeDefined();
    expect(studentInsert!.values).toMatchObject({
      dateOfBirth: '2014-05-11',
      gender: 'ছেলে',
      religion: 'ইসলাম',
      bloodGroup: 'B+',
      presentAddress: 'কুড়িগ্রাম সদর',
      permanentAddress: 'উলিপুর, কুড়িগ্রাম',
      birthCertificateNumber: '201412345678',
      motherNameBn: 'মোসা. ফাতেমা বেগম',
      guardianMobile: '01712345679',
    });
    expect(data.registrationNumber).toBe('26060001');
  });
});

describe('PeopleService.remove (B12)', () => {
  it('refuses to delete a student who has payments', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', userId: 'u-9', schoolId: 'school-1' }],
      payments: [{ id: 'p-1' }],
      marks: [],
      results: [],
      attendance: [],
      student_fees: [],
    });
    await expect(service.remove('students', admin, 'st-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deletes a clean student together with the login account', async () => {
    const { service, fake } = setup({
      students: [{ id: 'st-1', userId: 'u-9', schoolId: 'school-1' }],
      payments: [],
      marks: [],
      results: [],
      attendance: [],
      student_fees: [{ id: 'fee-1', paidAmount: 0 }],
      admission_applications: [],
    });
    await expect(service.remove('students', admin, 'st-1')).resolves.toEqual({
      data: { id: 'st-1' },
    });
    expect(fake.deleted).toContain('students');
    expect(fake.deleted).toContain('users');
    expect(fake.deleted).toContain('student_fees');
  });

  it('refuses to delete a teacher with salary records', async () => {
    const { service } = setup({
      teachers: [{ id: 't-1', userId: 'u-8', schoolId: 'school-1' }],
      salary_records: [{ id: 'sal-1' }],
      marks: [],
    });
    await expect(service.remove('teachers', admin, 't-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deletes staff plainly', async () => {
    const { service, fake } = setup({});
    await service.remove('staff', admin, 'staff-1');
    expect(fake.deleted).toEqual(['staff']);
  });
});
