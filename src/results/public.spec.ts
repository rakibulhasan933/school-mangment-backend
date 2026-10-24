import { describe, expect, it } from 'vitest';
import {
  examVisibility,
  isExamResultVisible,
  pickMeritorious,
  denseRankByTotal,
} from './public.js';

const now = new Date('2026-10-23T00:00:00.000Z');
const past = new Date('2026-10-01T00:00:00.000Z');
const future = new Date('2026-12-01T00:00:00.000Z');

describe('examVisibility', () => {
  it('hides exams that are not flagged published', () => {
    expect(examVisibility({ isPublished: false, publishAt: null }, now)).toBe(
      'hidden',
    );
    expect(examVisibility({ isPublished: false, publishAt: past }, now)).toBe(
      'hidden',
    );
  });

  it('marks future-dated published exams as scheduled', () => {
    expect(examVisibility({ isPublished: true, publishAt: future }, now)).toBe(
      'scheduled',
    );
    expect(
      isExamResultVisible({ isPublished: true, publishAt: future }, now),
    ).toBe(false);
  });

  it('publishes exams whose publishAt has passed or is null', () => {
    expect(examVisibility({ isPublished: true, publishAt: past }, now)).toBe(
      'published',
    );
    expect(examVisibility({ isPublished: true, publishAt: null }, now)).toBe(
      'published',
    );
    expect(
      isExamResultVisible({ isPublished: true, publishAt: null }, now),
    ).toBe(true);
  });
});

describe('pickMeritorious', () => {
  const rows = [
    { name: 'c', meritPosition: 3, gpa: '4.50', totalMarks: 700 },
    { name: 'a', meritPosition: 1, gpa: '5.00', totalMarks: 950 },
    { name: 'noPositionHigh', meritPosition: null, gpa: '5.00', totalMarks: 990 },
    { name: 'b', meritPosition: 2, gpa: '4.80', totalMarks: 800 },
    { name: 'noPositionLow', meritPosition: null, gpa: '3.50', totalMarks: 500 },
  ];

  it('orders by merit position, unpositioned rows last by GPA', () => {
    expect(pickMeritorious(rows, 5).map((row) => row.name)).toEqual([
      'a',
      'b',
      'c',
      'noPositionHigh',
      'noPositionLow',
    ]);
  });

  it('respects the limit', () => {
    expect(pickMeritorious(rows, 2).map((row) => row.name)).toEqual(['a', 'b']);
  });

  it('breaks merit ties by GPA then total marks', () => {
    const tied = [
      { name: 'x', meritPosition: 1, gpa: '4.00', totalMarks: 600 },
      { name: 'y', meritPosition: 1, gpa: '4.50', totalMarks: 550 },
      { name: 'z', meritPosition: 1, gpa: '4.50', totalMarks: 575 },
    ];
    expect(pickMeritorious(tied, 3).map((row) => row.name)).toEqual([
      'z',
      'y',
      'x',
    ]);
  });
});

describe('denseRankByTotal', () => {
  it('assigns dense ranks for tied totals', () => {
    const rows = [{ totalMarks: 90 }, { totalMarks: 90 }, { totalMarks: 80 }];
    expect(denseRankByTotal(rows, rows[2])).toBe(2);
  });
});
