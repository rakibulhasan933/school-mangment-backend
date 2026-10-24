import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { students, teachers } from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';

type StudentRow = typeof students.$inferSelect;
type TeacherRow = typeof teachers.$inferSelect;

/**
 * Round 6, B1 — tenant resolution for portal endpoints.
 *
 * The live bug: a student could log in (a token was issued) yet every
 * portal screen came back empty, because each query filtered by the
 * schoolId stored on the *user account* (which is what the JWT carries).
 * When the user row's schoolId and the student row's schoolId drift
 * apart — e.g. after a demo reset re-created accounts, or an account was
 * created before its school's records — the token points at a school
 * where the student has no record, so profile/attendance/fees all miss.
 *
 * The student row itself is the source of truth for "which school does
 * this student belong to": resolve the row by the token's user id
 * (students.userId is unique per account in practice), preferring the
 * row whose schoolId matches the token when several exist, and use the
 * STUDENT ROW's schoolId for every subsequent data query.
 */
export function pickOwnStudent<T extends { schoolId: string }>(
  rows: T[],
  tokenSchoolId: string,
): T | null {
  if (!rows.length) return null;
  return rows.find((row) => row.schoolId === tokenSchoolId) ?? rows[0]!;
}

export async function resolveOwnStudent(
  db: Database,
  user: Pick<AuthUser, 'id' | 'schoolId'>,
): Promise<{ student: StudentRow; schoolId: string } | null> {
  const rows = await db
    .select()
    .from(students)
    .where(eq(students.userId, user.id));
  const student = pickOwnStudent(rows, user.schoolId);
  return student ? { student, schoolId: student.schoolId } : null;
}

/** Same drift-proof resolution for the teacher portal / teacher finance. */
export async function resolveOwnTeacher(
  db: Database,
  user: Pick<AuthUser, 'id' | 'schoolId'>,
): Promise<{ teacher: TeacherRow; schoolId: string } | null> {
  const rows = await db
    .select()
    .from(teachers)
    .where(eq(teachers.userId, user.id));
  const teacher = pickOwnStudent(rows, user.schoolId);
  return teacher ? { teacher, schoolId: teacher.schoolId } : null;
}
