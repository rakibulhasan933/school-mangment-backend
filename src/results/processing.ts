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
  fullMarks?: number;
  groupKey?: string | null;
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
  if (!marks.some((mark) => mark.groupKey)) {
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
    return { total, gpa, letter: overall.letter, isPassed, subjects };
  }

  const groupIndices = new Map<string, number[]>();
  marks.forEach((mark, index) => {
    const key = mark.groupKey ?? `single:${index}`;
    const bucket = groupIndices.get(key) ?? [];
    bucket.push(index);
    groupIndices.set(key, bucket);
  });
  type Entry = {
    indices: number[];
    total: number;
    passMarks: number;
    absent: boolean;
    percent: number;
    letter: string;
    gpa: number;
    passed: boolean;
  };
  const entries: Entry[] = [...groupIndices.values()].map((indices) => {
    const total = indices.reduce((sum, i) => sum + marks[i]!.total, 0);
    const full = indices.reduce(
      (sum, i) => sum + (marks[i]!.fullMarks ?? 100),
      0,
    );
    const passMarks = indices.reduce((sum, i) => sum + marks[i]!.passMarks, 0);
    const absent = indices.some((i) => marks[i]!.isAbsent);
    const percent = full > 0 ? (total / full) * 100 : 0;
    const band = grade(Math.floor(percent + 1e-9));
    return {
      indices,
      total,
      passMarks,
      absent,
      percent,
      letter: absent ? 'F' : band.letter,
      gpa: absent ? 0 : band.gpa,
      passed: !absent && total >= passMarks,
    };
  });
  const entryByIndex = new Map<number, Entry>();
  for (const entry of entries) {
    for (const index of entry.indices) entryByIndex.set(index, entry);
  }
  const subjects = marks.map((mark, index) => {
    const entry = entryByIndex.get(index)!;
    return { ...mark, letter: entry.letter, gpa: entry.gpa };
  });
  const total = marks.reduce((sum, mark) => sum + mark.total, 0);
  const gpa = entries.length
    ? Math.round(
        (entries.reduce((sum, entry) => sum + entry.gpa, 0) / entries.length) *
          100,
      ) / 100
    : 0;
  const isPassed = failAnySubject
    ? entries.every((entry) => entry.passed)
    : entries.some((entry) => entry.passed);
  const averagePercent = entries.length
    ? entries.reduce((sum, entry) => sum + entry.percent, 0) / entries.length
    : 0;
  const overall = grade(Math.round(averagePercent));
  return { total, gpa, letter: overall.letter, isPassed, subjects };
}
