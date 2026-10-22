import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { schools, settings } from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { UpdateSettingsDto } from './dto/update-settings.dto.js';

@Injectable()
export class SchoolsService {
  private readonly db = createDb();

  async getSettings(user: AuthUser) {
    const [school] = await this.db
      .select()
      .from(schools)
      .where(eq(schools.id, user.schoolId))
      .limit(1);
    if (!school) throw new NotFoundException('প্রতিষ্ঠান পাওয়া যায়নি');
    const rows = await this.db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(eq(settings.schoolId, user.schoolId));
    return {
      data: {
        school,
        settings: Object.fromEntries(rows.map((row) => [row.key, row.value])),
      },
    };
  }

  async updateSettings(user: AuthUser, dto: UpdateSettingsDto) {
    const { settings: customSettings, ...schoolFields } = dto;
    const changedSchoolFields = Object.fromEntries(
      Object.entries(schoolFields).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changedSchoolFields).length)
      await this.db
        .update(schools)
        .set({ ...changedSchoolFields, updatedAt: new Date() })
        .where(eq(schools.id, user.schoolId));
    if (customSettings) {
      for (const [key, value] of Object.entries(customSettings)) {
        await this.db
          .insert(settings)
          .values({
            schoolId: user.schoolId,
            key,
            value,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [settings.schoolId, settings.key],
            set: { value, updatedAt: new Date() },
          });
      }
    }
    return this.getSettings(user);
  }
}
