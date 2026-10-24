import { describe, expect, it, vi } from 'vitest';
import { makeFakeDb, type FakeRow } from '../testing/fake-db.js';

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../db/index.js', () => ({
  createDb: () => holder.current,
}));

import { TeacherPortalController } from './teacher-portal.controller.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';

describe('TeacherPortalController.notices (B9)', () => {
  it('returns published general + teacher notices from the teacher school', async () => {
    const fake = makeFakeDb({
      teachers: [{ id: 't-1', userId: 'user-t', schoolId: 'school-real' }],
      notices: [
        { id: 'n1', titleBn: 'সাধারণ', audience: 'public', audienceClass: null, isPinned: false },
        { id: 'n2', titleBn: 'শিক্ষকদের জন্য', audience: 'teachers', audienceClass: null, isPinned: true },
        { id: 'n3', titleBn: 'শ্রেণিভিত্তিক', audience: 'public', audienceClass: 'cls-6', isPinned: false },
        { id: 'n4', titleBn: 'শিক্ষার্থীদের জন্য', audience: 'student', audienceClass: null, isPinned: false },
      ] as FakeRow[],
    });
    holder.current = fake.db;
    const controller = new TeacherPortalController();
    const request = {
      user: {
        id: 'user-t',
        schoolId: 'school-real',
        role: 'TEACHER',
        displayNameBn: 'শিক্ষক',
      },
    } as unknown as AuthenticatedRequest;
    const { data } = await controller.noticesForTeacher(request);
    expect(data.map((row) => row.id)).toEqual(['n1', 'n2']);
  });
});
