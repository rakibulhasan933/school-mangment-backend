import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  academicClasses,
  academicSessions,
  sections,
  subjects,
} from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';
const tables = {
  sessions: academicSessions,
  classes: academicClasses,
  sections,
  subjects,
} as const;
type Resource = keyof typeof tables;
@Injectable()
export class AcademicsService {
  private readonly db = createDb();
  async list(resource: Resource, schoolId: string) {
    if (resource === 'sections') {
      // Sections must show which class they belong to — join the class name.
      const joined = await this.db
        .select({ section: sections, classNameBn: academicClasses.nameBn })
        .from(sections)
        .innerJoin(
          academicClasses,
          eq(academicClasses.id, sections.classId),
        )
        .where(eq(sections.schoolId, schoolId))
        .orderBy(asc(sections.createdAt));
      return {
        data: joined.map((row) => ({
          ...row.section,
          classNameBn: row.classNameBn,
        })),
      };
    }
    const table = tables[resource];
    return {
      data: await this.db
        .select()
        .from(table)
        .where(eq(table.schoolId, schoolId))
        .orderBy(asc(table.createdAt)),
    };
  }
  async create(
    resource: Resource,
    user: AuthUser,
    value: Record<string, unknown>,
  ) {
    const table = tables[resource];
    const [row] = await this.db
      .insert(table)
      .values({ ...value, schoolId: user.schoolId } as never)
      .returning();
    return { data: row };
  }
  async update(
    resource: Resource,
    user: AuthUser,
    id: string,
    value: Record<string, unknown>,
  ) {
    const table = tables[resource];
    const [row] = await this.db
      .update(table)
      .set({ ...value, updatedAt: new Date() } as never)
      .where(and(eq(table.id, id), eq(table.schoolId, user.schoolId)))
      .returning();
    if (!row) throw new NotFoundException('একাডেমিক রেকর্ড পাওয়া যায়নি');
    return { data: row };
  }
  async remove(resource: Resource, user: AuthUser, id: string) {
    const table = tables[resource];
    try {
      const [row] = await this.db
        .delete(table)
        .where(and(eq(table.id, id), eq(table.schoolId, user.schoolId)))
        .returning();
      if (!row) throw new NotFoundException('একাডেমিক রেকর্ড পাওয়া যায়নি');
      return { data: row };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      // Foreign-key references (students, sections, routine…) block the delete.
      throw new BadRequestException(
        'এই রেকর্ডের সাথে অন্য তথ্য যুক্ত আছে, তাই মোছা যাবে না',
      );
    }
  }
}
