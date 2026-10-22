export type GradeScale = {
  minMarks: number;
  maxMarks: number;
  letter: string;
  gpa: number;
};
export type SubjectMark = {
  total: number;
  passMarks: number;
  isAbsent?: boolean;
};
export type ProcessedResult = {
  total: number;
  gpa: number;
  letter: string;
  isPassed: boolean;
  subjects: Array<SubjectMark & { letter: string; gpa: number }>;
};

export function validateScale(scale: GradeScale[]) {
  const ordered = [...scale].sort((a, b) => a.minMarks - b.minMarks);
  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index]!;
    if (
      row.minMarks > row.maxMarks ||
      (index > 0 && row.minMarks !== ordered[index - 1]!.maxMarks + 1)
    )
      throw new Error('গ্রেডিং স্কেলে gap বা overlap আছে');
  }
  return ordered;
}
export function processStudentResult(
  marks: SubjectMark[],
  scale: GradeScale[],
  failAnySubject = true,
): ProcessedResult {
  const ordered = validateScale(scale);
  const grade = (total: number) =>
    ordered.find((row) => total >= row.minMarks && total <= row.maxMarks) ??
    ordered[0]!;
  const subjects = marks.map((mark) => {
    const current = grade(mark.total);
    return {
      ...mark,
      letter: mark.isAbsent ? 'F' : current.letter,
      gpa: mark.isAbsent ? 0 : current.gpa,
    };
  });
  const total = subjects.reduce((sum, mark) => sum + mark.total, 0);
  const gpa = subjects.length
    ? Math.round(
        (subjects.reduce((sum, mark) => sum + mark.gpa, 0) / subjects.length) *
          100,
      ) / 100
    : 0;
  const isPassed = failAnySubject
    ? subjects.every((mark) => !mark.isAbsent && mark.total >= mark.passMarks)
    : subjects.some((mark) => !mark.isAbsent && mark.total >= mark.passMarks);
  const overall = grade(Math.round(total / Math.max(subjects.length, 1)));
  return {
    total,
    gpa,
    letter: overall.letter,
    isPassed,
    subjects,
  } as ProcessedResult;
}
