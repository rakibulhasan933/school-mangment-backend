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
