import { describe, expect, it } from 'vitest';
import { processStudentResult } from './processing.js';
const scale = [
  { minMarks: 0, maxMarks: 32, letter: 'F', gpa: 0 },
  { minMarks: 33, maxMarks: 39, letter: 'D', gpa: 1 },
  { minMarks: 40, maxMarks: 49, letter: 'C', gpa: 2 },
  { minMarks: 50, maxMarks: 59, letter: 'B', gpa: 3 },
  { minMarks: 60, maxMarks: 69, letter: 'A-', gpa: 3.5 },
  { minMarks: 70, maxMarks: 79, letter: 'A', gpa: 4 },
  { minMarks: 80, maxMarks: 100, letter: 'A+', gpa: 5 },
];
describe('result processing', () => {
  it('computes a hand-checkable GPA', () => {
    const result = processStudentResult(
      [
        { total: 85, passMarks: 33 },
        { total: 75, passMarks: 33 },
      ],
      scale,
    );
    expect(result.gpa).toBe(4.5);
    expect(result.total).toBe(160);
  });
  it('uses the exact 80 A+ boundary', () => {
    expect(
      processStudentResult([{ total: 80, passMarks: 33 }], scale).subjects[0]
        ?.letter,
    ).toBe('A+');
  });
  it('fails when one subject fails', () => {
    expect(
      processStudentResult(
        [
          { total: 80, passMarks: 33 },
          { total: 20, passMarks: 33 },
        ],
        scale,
      ).isPassed,
    ).toBe(false);
  });
  it('treats absence as failure', () => {
    const result = processStudentResult(
      [
        { total: 90, passMarks: 33 },
        { total: 0, passMarks: 33, isAbsent: true },
      ],
      scale,
    );
    expect(result.isPassed).toBe(false);
    expect(result.subjects[1]?.letter).toBe('F');
  });
});

describe('combined papers (board rule)', () => {
  const pair = (total: number, extra: Record<string, unknown> = {}) => ({
    total,
    passMarks: 33,
    fullMarks: 100,
    groupKey: 'bangla',
    ...extra,
  });

  it('passes when the combined total reaches the combined pass mark', () => {
    const result = processStudentResult([pair(25), pair(48)], scale);
    expect(result.isPassed).toBe(true);
    expect(result.subjects[0]?.letter).toBe('D');
    expect(result.subjects[1]?.letter).toBe('D');
    expect(result.gpa).toBe(1);
    expect(result.total).toBe(73);
  });

  it('fails when the combined total is below the combined pass mark', () => {
    const result = processStudentResult([pair(30), pair(30)], scale);
    expect(result.isPassed).toBe(false);
    expect(result.gpa).toBe(0);
  });

  it('counts the pair once in GPA', () => {
    const result = processStudentResult([pair(100), pair(0)], scale);
    expect(result.gpa).toBe(3);
    expect(result.subjects[0]?.letter).toBe('B');
    expect(result.isPassed).toBe(true);
  });

  it('grades a strong pair on the combined percentage', () => {
    const result = processStudentResult([pair(80), pair(85)], scale);
    expect(result.isPassed).toBe(true);
    expect(result.gpa).toBe(5);
    expect(result.subjects[1]?.letter).toBe('A+');
  });

  it('fails the pair when either paper is absent', () => {
    const result = processStudentResult(
      [pair(90), pair(0, { isAbsent: true })],
      scale,
    );
    expect(result.isPassed).toBe(false);
    expect(result.subjects[0]?.letter).toBe('F');
    expect(result.subjects[1]?.letter).toBe('F');
  });

  it('mixes paired and single subjects', () => {
    const result = processStudentResult(
      [pair(25), pair(48), { total: 80, passMarks: 33, fullMarks: 100 }],
      scale,
    );
    expect(result.isPassed).toBe(true);
    expect(result.gpa).toBe(3);
  });

  it('does not combine when only one paper carries the group', () => {
    const result = processStudentResult(
      [{ total: 25, passMarks: 33, fullMarks: 100, groupKey: 'bangla' }],
      scale,
    );
    expect(result.isPassed).toBe(false);
  });
});
