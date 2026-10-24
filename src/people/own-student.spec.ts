import { describe, expect, it } from 'vitest';
import { pickOwnStudent } from './own-student.js';

describe('pickOwnStudent (B1)', () => {
  const rows = [
    { id: 's-old', schoolId: 'school-old' },
    { id: 's-real', schoolId: 'school-real' },
  ];
  it('prefers the row in the token school when several exist', () => {
    expect(pickOwnStudent(rows, 'school-real')?.id).toBe('s-real');
    expect(pickOwnStudent(rows, 'school-old')?.id).toBe('s-old');
  });
  it('falls back to the student row itself when the token school has no record (the live drift case)', () => {
    expect(pickOwnStudent([rows[1]!], 'school-WRONG')?.id).toBe('s-real');
  });
  it('returns null when the account has no student row at all', () => {
    expect(pickOwnStudent([], 'school-real')).toBeNull();
  });
});
