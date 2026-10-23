export type ExamVisibility = 'hidden' | 'scheduled' | 'published';

export type ExamVisibilityInput = {
  isPublished: boolean;
  publishAt: Date | string | null;
};

/**
 * Public visibility of an exam:
 * - not flagged published -> hidden
 * - flagged published with a future publishAt -> scheduled (countdown only)
 * - flagged published and publishAt reached (or null) -> published
 */
export function examVisibility(
  exam: ExamVisibilityInput,
  now: Date,
): ExamVisibility {
  if (!exam.isPublished) return 'hidden';
  if (exam.publishAt && new Date(exam.publishAt).getTime() > now.getTime())
    return 'scheduled';
  return 'published';
}

export function isExamResultVisible(
  exam: ExamVisibilityInput,
  now: Date,
): boolean {
  return examVisibility(exam, now) === 'published';
}

export type MeritoriousCandidate = {
  meritPosition: number | null;
  gpa: string;
  totalMarks: number;
};

/**
 * Top students of one published exam: merit position first (missing
 * positions last), then higher GPA, then higher total marks.
 */
export function pickMeritorious<T extends MeritoriousCandidate>(
  rows: T[],
  limit = 6,
): T[] {
  return [...rows]
    .sort((a, b) => {
      const aMerit = a.meritPosition ?? Number.POSITIVE_INFINITY;
      const bMerit = b.meritPosition ?? Number.POSITIVE_INFINITY;
      if (aMerit !== bMerit) return aMerit - bMerit;
      const gpaDiff =
        Number.parseFloat(b.gpa) - Number.parseFloat(a.gpa);
      if (gpaDiff !== 0) return gpaDiff;
      return b.totalMarks - a.totalMarks;
    })
    .slice(0, limit);
}
