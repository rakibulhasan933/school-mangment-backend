import { Injectable, NotFoundException } from '@nestjs/common';
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
}
