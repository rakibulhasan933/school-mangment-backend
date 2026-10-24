import { describe, expect, it } from 'vitest';
import { examScheduleError } from './exam-dates.js';

describe('examScheduleError (B10)', () => {
  it('rejects a result date before the exam end (the live Nov 20 / Dec 15 case)', () => {
    expect(
      examScheduleError({ endsAt: '2026-12-15', publishAt: '2026-11-20' }),
    ).toMatch(/আগে হতে পারে না/);
  });
  it('accepts a result date after the exam ends', () => {
    expect(
      examScheduleError({ endsAt: '2026-12-15', publishAt: '2026-12-20' }),
    ).toBeNull();
  });
  it('accepts a result date on the last exam day', () => {
    expect(
      examScheduleError({
        endsAt: '2026-12-15',
        publishAt: new Date('2026-12-15T10:00:00Z'),
      }),
    ).toBeNull();
  });
  it('stays silent when either date is missing', () => {
    expect(examScheduleError({ endsAt: null, publishAt: '2026-11-20' })).toBeNull();
    expect(examScheduleError({ endsAt: '2026-12-15', publishAt: null })).toBeNull();
    expect(examScheduleError({})).toBeNull();
  });
});
