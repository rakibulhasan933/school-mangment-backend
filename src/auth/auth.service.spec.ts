import { describe, expect, it, vi } from 'vitest';
import { makeFakeDb, type FakeRow } from '../testing/fake-db.js';

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../db/index.js', () => ({
  createDb: () => holder.current,
}));

import { AuthService } from './auth.service.js';

process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-secret-that-is-long-enough-32chars';

function decodePayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]!;
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

describe('AuthService.studentLogin (B1)', () => {
  it('issues the token for the STUDENT RECORD school when the account school drifted', async () => {
    const fake = makeFakeDb({
      users: [
        {
          id: 'user-1',
          schoolId: 'school-WRONG',
          role: 'STUDENT',
          registrationNumber: '26100001',
          displayNameBn: 'আরিফুল ইসলাম',
          isActive: true,
          passwordHash: null,
        } as FakeRow,
      ],
      students: [{ id: 'st-1', userId: 'user-1', schoolId: 'school-real' }],
    });
    holder.current = fake.db;
    const service = new AuthService();
    const { data } = await service.studentLogin('26100001');
    expect(decodePayload(data.accessToken).schoolId).toBe('school-real');
    expect(data.user.schoolId).toBe('school-real');
    expect(data.user.role).toBe('STUDENT');
  });

  it('keeps the account school when it already matches the student record', async () => {
    const fake = makeFakeDb({
      users: [
        {
          id: 'user-1',
          schoolId: 'school-real',
          role: 'STUDENT',
          registrationNumber: '26100001',
          displayNameBn: 'আরিফুল ইসলাম',
          isActive: true,
          passwordHash: null,
        } as FakeRow,
      ],
      students: [{ id: 'st-1', userId: 'user-1', schoolId: 'school-real' }],
    });
    holder.current = fake.db;
    const service = new AuthService();
    const { data } = await service.studentLogin(' 26100001 ');
    expect(decodePayload(data.accessToken).schoolId).toBe('school-real');
  });
});
