import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  admissionApplications,
  admissionSettings,
  academicClasses,
  academicSessions,
  students,
  users,
} from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';

@Injectable()
export class AdmissionService {
  private readonly db = createDb();
  async settings(schoolId: string) {
    const [row] = await this.db
      .select()
      .from(admissionSettings)
      .where(eq(admissionSettings.schoolId, schoolId))
      .limit(1);
    return { data: row ?? null };
  }
  async saveSettings(user: AuthUser, value: Record<string, unknown>) {
    // Partial saves must not wipe the rest: the admin's open/close toggle
    // sends only { isOpen }, the window form sends only the dates. Any key
    // absent from the payload keeps its stored value.
    const [existing] = await this.db
      .select()
      .from(admissionSettings)
      .where(eq(admissionSettings.schoolId, user.schoolId))
      .limit(1);
    const merged = {
      isOpen:
        value.isOpen !== undefined
          ? Boolean(value.isOpen)
          : (existing?.isOpen ?? false),
      opensAt:
        value.opensAt !== undefined
          ? value.opensAt
            ? new Date(String(value.opensAt))
            : null
          : (existing?.opensAt ?? null),
      closesAt:
        value.closesAt !== undefined
          ? value.closesAt
            ? new Date(String(value.closesAt))
            : null
          : (existing?.closesAt ?? null),
      fields:
        value.fields !== undefined ? value.fields : (existing?.fields ?? []),
      seatCounts:
        value.seatCounts !== undefined
          ? value.seatCounts
          : (existing?.seatCounts ?? {}),
    };
    const [row] = await this.db
      .insert(admissionSettings)
      .values({ schoolId: user.schoolId, ...merged })
      .onConflictDoUpdate({
        target: admissionSettings.schoolId,
        set: { ...merged, updatedAt: new Date() },
      })
      .returning();
    return { data: row };
  }
  async submit(schoolId: string, value: Record<string, unknown>) {
    const setting = await this.settings(schoolId);
    const now = new Date();
    if (
      !setting.data?.isOpen ||
      (setting.data.opensAt && setting.data.opensAt > now) ||
      (setting.data.closesAt && setting.data.closesAt < now)
    )
      throw new BadRequestException('ভর্তি আবেদন বর্তমানে বন্ধ');
    const trackingId = `ADM-${now.getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const [row] = await this.db
      .insert(admissionApplications)
      .values({
        schoolId,
        trackingId,
        admissionClassId: value.admissionClassId
          ? String(value.admissionClassId)
          : undefined,
        preferredSectionId: value.preferredSectionId
          ? String(value.preferredSectionId)
          : undefined,
        sessionId: value.sessionId ? String(value.sessionId) : undefined,
        applicant: value.applicant ?? value,
        photoUrl: value.photoUrl ? String(value.photoUrl) : undefined,
      })
      .returning({
        trackingId: admissionApplications.trackingId,
        status: admissionApplications.status,
      });
    return { data: row };
  }
  async status(schoolId: string, trackingId: string) {
    const [row] = await this.db
      .select({
        trackingId: admissionApplications.trackingId,
        status: admissionApplications.status,
        reviewNote: admissionApplications.reviewNote,
        createdAt: admissionApplications.createdAt,
      })
      .from(admissionApplications)
      .where(
        and(
          eq(admissionApplications.schoolId, schoolId),
          eq(admissionApplications.trackingId, trackingId),
        ),
      )
      .limit(1);
    return { data: row ?? null };
  }
  async list(schoolId: string) {
    return {
      data: await this.db
        .select()
        .from(admissionApplications)
        .where(eq(admissionApplications.schoolId, schoolId))
        .orderBy(asc(admissionApplications.createdAt)),
    };
  }
  async review(
    user: AuthUser,
    id: string,
    status: 'APPROVED' | 'REJECTED',
    note?: string,
  ) {
    const [application] = await this.db
      .select()
      .from(admissionApplications)
      .where(
        and(
          eq(admissionApplications.id, id),
          eq(admissionApplications.schoolId, user.schoolId),
        ),
      )
      .limit(1);
    if (!application) throw new NotFoundException('আবেদন পাওয়া যায়নি');
    if (status === 'REJECTED') {
      const [row] = await this.db
        .update(admissionApplications)
        .set({
          status,
          reviewNote: note ?? '',
          reviewedBy: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(admissionApplications.id, id))
        .returning();
      return { data: row };
    }
    if (!application.sessionId || !application.admissionClassId)
      throw new BadRequestException('আবেদনে সেশন ও শ্রেণি নেই');
    const [session] = await this.db
      .select()
      .from(academicSessions)
      .where(
        and(
          eq(academicSessions.id, application.sessionId),
          eq(academicSessions.schoolId, user.schoolId),
        ),
      )
      .limit(1);
    const [classRow] = await this.db
      .select()
      .from(academicClasses)
      .where(
        and(
          eq(academicClasses.id, application.admissionClassId),
          eq(academicClasses.schoolId, user.schoolId),
        ),
      )
      .limit(1);
    if (!session || !classRow)
      throw new BadRequestException('সেশন বা শ্রেণি পাওয়া যায়নি');
    const count = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.schoolId, user.schoolId), eq(users.role, 'STUDENT')));
    const registrationNumber = `${String(session.year).slice(-2)}${String(classRow.orderIndex + 5).padStart(2, '0')}${String(count.length + 1).padStart(4, '0')}`;
    const applicant = application.applicant as {
      displayNameBn?: string;
      nameBn?: string;
      nameEn?: string;
      guardianMobile?: string;
    };
    const [account] = await this.db
      .insert(users)
      .values({
        schoolId: user.schoolId,
        role: 'STUDENT',
        registrationNumber,
        displayNameBn:
          applicant.displayNameBn ??
          applicant.nameBn ??
          applicant.nameEn ??
          'নতুন শিক্ষার্থী',
      })
      .returning();
    if (!account) throw new Error('শিক্ষার্থী account তৈরি হয়নি');
    const [student] = await this.db
      .insert(students)
      .values({
        schoolId: user.schoolId,
        userId: account.id,
        sessionId: application.sessionId,
        classId: application.admissionClassId,
        sectionId: application.preferredSectionId,
        guardianMobile: applicant.guardianMobile,
        photoUrl: application.photoUrl,
        admissionDate: new Date().toISOString().slice(0, 10),
      })
      .returning();
    const [row] = await this.db
      .update(admissionApplications)
      .set({
        status,
        reviewNote: note ?? '',
        reviewedBy: user.id,
        reviewedAt: new Date(),
        studentId: student?.id,
        updatedAt: new Date(),
      })
      .where(eq(admissionApplications.id, id))
      .returning();
    return { data: row, registrationNumber };
  }
}
