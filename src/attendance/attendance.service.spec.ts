import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { makeFakeDb, type FakeRow } from '../testing/fake-db.js';

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../db/index.js', () => ({
  createDb: () => holder.current,
}));

import { AttendanceService } from './attendance.service.js';
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
  return { service: new AttendanceService(), fake };
}

// Selected-shape rows, as the service's .select() projects them.
const rows = [
  { date: '2026-09-01', status: 'PRESENT', note: null },
  { date: '2026-09-02', status: 'ABSENT', note: 'অসুস্থ' },
  { date: '2026-10-01', status: 'PRESENT', note: null },
  { date: '2026-10-02', status: 'PRESENT', note: null },
  { date: '2026-10-03', status: 'LEAVE', note: null },
  { date: '2026-10-04', status: 'ABSENT', note: null },
];

describe('AttendanceService.studentAttendance (Round 9 profile attendance tab)', () => {
  it('defaults to the latest month with records and summarizes month + overall', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', schoolId: 'school-1' }],
      attendance: rows,
    });
    const { data } = await service.studentAttendance(admin, 'st-1');
    expect(data.month).toBe('2026-10');
    expect(data.months).toEqual(['2026-10', '2026-09']);
    expect(data.records).toHaveLength(4);
    expect(data.summary).toEqual({
      totalDays: 4,
      present: 2,
      absent: 1,
      leave: 1,
      percentage: 50,
    });
    expect(data.overall).toEqual({
      totalDays: 6,
      present: 3,
      absent: 2,
      leave: 1,
      percentage: 50,
    });
  });

  it('honours an explicit month parameter', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', schoolId: 'school-1' }],
      attendance: rows,
    });
    const { data } = await service.studentAttendance(admin, 'st-1', '2026-09');
    expect(data.month).toBe('2026-09');
    expect(data.records.map((row) => row.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
    ]);
    expect(data.summary.totalDays).toBe(2);
  });

  it('returns empty months and zero summaries for a student with no records', async () => {
    const { service } = setup({
      students: [{ id: 'st-1', schoolId: 'school-1' }],
      attendance: [],
    });
    const { data } = await service.studentAttendance(admin, 'st-1');
    expect(data.months).toEqual([]);
    expect(data.records).toEqual([]);
    expect(data.summary).toEqual({
      totalDays: 0,
      present: 0,
      absent: 0,
      leave: 0,
      percentage: 0,
    });
    expect(data.overall.totalDays).toBe(0);
  });

  it('throws NotFound when the student is not in the caller school', async () => {
    const { service } = setup({ students: [] });
    await expect(
      service.studentAttendance(admin, 'st-other-school'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
