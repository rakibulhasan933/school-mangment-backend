import { Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  banners,
  committee,
  complaints,
  contactMessages,
  downloads,
  events,
  exams,
  galleries,
  galleryItems,
  holidays,
  homepageBlocks,
  importantLinks,
  menuItems,
  messages,
  menus,
  news,
  notices,
  pages,
  quotes,
  results,
  schools,
  serviceBoxes,
  serviceBoxLinks,
  students,
  teachers,
  users,
  videos,
} from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';
import { pickMeritorious } from '../results/public.js';

const resources = {
  pages,
  banners,
  notices,
  news,
  events,
  galleries,
  downloads,
  importantLinks,
  quotes,
  messages,
  homepageBlocks,
  serviceBoxes,
  menus,
  contactMessages,
  complaints,
  holidays,
  videos,
  committee,
} as const;
export type ContentResource = keyof typeof resources;

/**
 * A stored content row is publicly visible unless one of its visibility
 * flags (isPublished / isEnabled / isActive — whichever the table has)
 * is switched off. Rows without any flag (e.g. events) are always visible.
 */
export function isPubliclyVisible(row: Record<string, unknown>): boolean {
  if ('isPublished' in row && !row.isPublished) return false;
  if ('isEnabled' in row && !row.isEnabled) return false;
  if ('isActive' in row && !row.isActive) return false;
  return true;
}

const STAFF_ONLY_AUDIENCES = ['teacher', 'teachers', 'admin', 'staff'];

/**
 * Notices addressed to staff only (audience teacher/admin/staff) must
 * never appear on the public notice board or homepage ticker — the same
 * rule the student portal applies (there they are hidden from students;
 * here they are hidden from the public entirely).
 */
export function isStaffOnlyAudience(audience?: string | null): boolean {
  return STAFF_ONLY_AUDIENCES.includes((audience ?? 'public').toLowerCase());
}

@Injectable()
export class ContentService {
  private readonly db = createDb();
  private table(resource: string) {
    if (!(resource in resources))
      throw new NotFoundException('কনটেন্টের ধরন পাওয়া যায়নি');
    return resources[resource as ContentResource];
  }
  private schoolColumn(resource: ContentResource) {
    return 'schoolId' in resources[resource]
      ? resources[resource].schoolId
      : undefined;
  }

  async home(schoolId: string) {
    const now = new Date();
    const [
      schoolRows,
      blocks,
      menu,
      services,
      bannerRows,
      pageRows,
      noticeRows,
      newsRows,
      eventRows,
      galleryRows,
      downloadRows,
      linkRows,
      quoteRows,
      messageRows,
    ] = await Promise.all([
      this.db
        .select({
          nameBn: schools.nameBn,
          nameEn: schools.nameEn,
          eiin: schools.eiin,
          address: schools.address,
          foundedYear: schools.foundedYear,
          logoUrl: schools.logoUrl,
          phone: schools.phone,
          email: schools.email,
        })
        .from(schools)
        .where(eq(schools.id, schoolId))
        .limit(1),
      this.db
        .select()
        .from(homepageBlocks)
        .where(
          and(
            eq(homepageBlocks.schoolId, schoolId),
            eq(homepageBlocks.isEnabled, true),
          ),
        )
        .orderBy(asc(homepageBlocks.orderIndex)),
      this.db
        .select()
        .from(menus)
        .where(and(eq(menus.schoolId, schoolId), eq(menus.isActive, true))),
      this.db
        .select()
        .from(serviceBoxes)
        .where(
          and(
            eq(serviceBoxes.schoolId, schoolId),
            eq(serviceBoxes.isEnabled, true),
          ),
        )
        .orderBy(asc(serviceBoxes.orderIndex)),
      this.db
        .select()
        .from(banners)
        .where(and(eq(banners.schoolId, schoolId), eq(banners.isEnabled, true)))
        .orderBy(asc(banners.orderIndex)),
      this.db
        .select()
        .from(pages)
        .where(and(eq(pages.schoolId, schoolId), eq(pages.isPublished, true))),
      this.db
        .select()
        .from(notices)
        .where(
          and(
            eq(notices.schoolId, schoolId),
            eq(notices.isPublished, true),
            or(isNull(notices.publishAt), lte(notices.publishAt, now)),
            or(isNull(notices.expiresAt), gt(notices.expiresAt, now)),
          ),
        )
        .orderBy(asc(notices.isPinned), asc(notices.createdAt)),
      this.db
        .select()
        .from(news)
        .where(and(eq(news.schoolId, schoolId), eq(news.isPublished, true)))
        .orderBy(asc(news.publishedAt)),
      this.db
        .select()
        .from(events)
        .where(eq(events.schoolId, schoolId))
        .orderBy(asc(events.startsAt)),
      this.db
        .select()
        .from(galleries)
        .where(
          and(
            eq(galleries.schoolId, schoolId),
            eq(galleries.isPublished, true),
          ),
        ),
      this.db
        .select()
        .from(downloads)
        .where(
          and(
            eq(downloads.schoolId, schoolId),
            eq(downloads.isPublished, true),
          ),
        ),
      this.db
        .select()
        .from(importantLinks)
        .where(
          and(
            eq(importantLinks.schoolId, schoolId),
            eq(importantLinks.isEnabled, true),
          ),
        )
        .orderBy(asc(importantLinks.orderIndex)),
      this.db
        .select()
        .from(quotes)
        .where(and(eq(quotes.schoolId, schoolId), eq(quotes.isEnabled, true))),
      this.db
        .select()
        .from(messages)
        .where(
          and(eq(messages.schoolId, schoolId), eq(messages.isEnabled, true)),
        )
        .orderBy(asc(messages.orderIndex)),
    ]);
    const menuItemsRows = menu.length
      ? await this.db
          .select()
          .from(menuItems)
          .where(
            inArray(
              menuItems.menuId,
              menu.map((item) => item.id),
            ),
          )
      : [];
    const serviceItemsRows = services.length
      ? await this.db
          .select()
          .from(serviceBoxLinks)
          .where(
            inArray(
              serviceBoxLinks.serviceBoxId,
              services.map((item) => item.id),
            ),
          )
      : [];
    const [[{ count: studentCount }], [{ count: teacherCount }]] =
      await Promise.all([
        this.db
          .select({ count: sql<number>`count(*)` })
          .from(students)
          .where(eq(students.schoolId, schoolId)),
        this.db
          .select({ count: sql<number>`count(*)` })
          .from(teachers)
          .where(eq(teachers.schoolId, schoolId)),
      ]);
    const teacherRows = await this.db
      .select({
        id: users.id,
        nameBn: users.displayNameBn,
        username: users.username,
      })
      .from(users)
      .where(
        and(
          eq(users.schoolId, schoolId),
          eq(users.role, 'TEACHER'),
          eq(users.isActive, true),
        ),
      )
      .limit(8);
    const studentRows = await this.meritoriousStudents(schoolId, now);
    return {
      data: {
        school: schoolRows[0],
        stats: {
          students: Number(studentCount),
          teachers: Number(teacherCount),
        },
        teachers: teacherRows,
        meritoriousStudents: studentRows,
        blocks,
        menu,
        menuItems: menuItemsRows,
        services,
        serviceLinks: serviceItemsRows,
        banners: bannerRows,
        pages: pageRows,
        notices: noticeRows.filter(
          (row) => !isStaffOnlyAudience(row.audience),
        ),
        news: newsRows,
        events: eventRows,
        galleries: galleryRows,
        downloads: downloadRows,
        links: linkRows,
        quotes: quoteRows,
        messages: messageRows,
      },
    };
  }

  /**
   * Meritorious students are derived from the most recent published exam:
   * its processed results, best first. Before any result is published the
   * section falls back to the first active students (without marks).
   */
  private async meritoriousStudents(schoolId: string, now: Date) {
    const [latestExam] = await this.db
      .select({ id: exams.id })
      .from(exams)
      .where(
        and(
          eq(exams.schoolId, schoolId),
          eq(exams.isPublished, true),
          or(isNull(exams.publishAt), lte(exams.publishAt, now)),
        ),
      )
      .orderBy(desc(exams.createdAt))
      .limit(1);
    if (latestExam) {
      const rows = await this.db
        .select({
          id: users.id,
          nameBn: users.displayNameBn,
          registrationNumber: users.registrationNumber,
          photoUrl: students.photoUrl,
          totalMarks: results.totalMarks,
          gpa: results.gpa,
          meritPosition: results.meritPosition,
        })
        .from(results)
        .innerJoin(students, eq(results.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(
          and(
            eq(results.schoolId, schoolId),
            eq(results.examId, latestExam.id),
            eq(users.isActive, true),
          ),
        );
      if (rows.length)
        return pickMeritorious(rows, 6).map((row) => ({
          id: row.id,
          nameBn: row.nameBn,
          registrationNumber: row.registrationNumber,
          photoUrl: row.photoUrl,
          totalMarks: row.totalMarks,
          gpa: row.gpa,
        }));
    }
    const fallback = await this.db
      .select({
        id: users.id,
        nameBn: users.displayNameBn,
        registrationNumber: users.registrationNumber,
        photoUrl: students.photoUrl,
      })
      .from(users)
      .leftJoin(students, eq(students.userId, users.id))
      .where(
        and(
          eq(users.schoolId, schoolId),
          eq(users.role, 'STUDENT'),
          eq(users.isActive, true),
        ),
      )
      .orderBy(asc(users.registrationNumber))
      .limit(6);
    return fallback.map((row) => ({ ...row, totalMarks: null, gpa: null }));
  }

  async list(resource: string, schoolId: string) {
    const table = this.table(resource);
    const school = this.schoolColumn(resource as ContentResource);
    if (!school) return { data: [] };
    return {
      data: await this.db
        .select()
        .from(table)
        .where(eq(school, schoolId as never)),
    };
  }

  async publicList(resource: string, schoolId: string) {
    const now = new Date();
    switch (resource) {
      case 'pages':
        return {
          data: await this.db
            .select()
            .from(pages)
            .where(
              and(eq(pages.schoolId, schoolId), eq(pages.isPublished, true)),
            ),
        };
      case 'notices': {
        const rows = await this.db
          .select()
          .from(notices)
          .where(
            and(
              eq(notices.schoolId, schoolId),
              eq(notices.isPublished, true),
              or(isNull(notices.publishAt), lte(notices.publishAt, now)),
              or(isNull(notices.expiresAt), gt(notices.expiresAt, now)),
            ),
          );
        return {
          data: rows.filter((row) => !isStaffOnlyAudience(row.audience)),
        };
      }
      case 'news': {
        const rows = await this.db
          .select()
          .from(news)
          .where(and(eq(news.schoolId, schoolId), eq(news.isPublished, true)));
        return { data: rows.map((row) => ({ ...row, body: row.details })) };
      }
      case 'galleries': {
        const rows = await this.db
          .select()
          .from(galleries)
          .where(
            and(
              eq(galleries.schoolId, schoolId),
              eq(galleries.isPublished, true),
            ),
          );
        const items = rows.length
          ? await this.db
              .select()
              .from(galleryItems)
              .where(
                inArray(
                  galleryItems.galleryId,
                  rows.map((row) => row.id),
                ),
              )
              .orderBy(asc(galleryItems.orderIndex))
          : [];
        return {
          data: rows.map((row) => ({
            ...row,
            items: items.filter((item) => item.galleryId === row.id),
          })),
        };
      }
      case 'holidays': {
        const rows = await this.db
          .select()
          .from(holidays)
          .where(
            and(eq(holidays.schoolId, schoolId), eq(holidays.isPublished, true)),
          )
          .orderBy(asc(holidays.fromDate));
        return {
          data: rows.map((row) => ({
            ...row,
            dayCount:
              Math.round(
                (Date.parse(row.toDate) - Date.parse(row.fromDate)) / 86400000,
              ) + 1,
          })),
        };
      }
      case 'videos':
        return {
          data: await this.db
            .select()
            .from(videos)
            .where(
              and(eq(videos.schoolId, schoolId), eq(videos.isPublished, true)),
            )
            .orderBy(desc(videos.publishedAt)),
        };
      case 'committee':
        return {
          data: await this.db
            .select()
            .from(committee)
            .where(
              and(
                eq(committee.schoolId, schoolId),
                eq(committee.isPublished, true),
              ),
            )
            .orderBy(asc(committee.orderIndex)),
        };
      case 'downloads':
        return {
          data: await this.db
            .select()
            .from(downloads)
            .where(
              and(
                eq(downloads.schoolId, schoolId),
                eq(downloads.isPublished, true),
              ),
            ),
        };
      default: {
        // Inbox resources hold private submissions (names, phone numbers,
        // message bodies) — never expose them through the public API.
        if (resource === 'contactMessages' || resource === 'complaints')
          return { data: [] };
        // Every other resource honours its visibility flags here, exactly
        // like the home payload does — switching a record off in the admin
        // must also remove it from the public listing pages.
        const { data } = await this.list(resource, schoolId);
        return {
          data: data.filter((row) =>
            isPubliclyVisible(row as Record<string, unknown>),
          ),
        };
      }
    }
  }

  /** Single published item read for public detail pages (news today). */
  async publicOne(resource: string, schoolId: string, id: string) {
    if (resource !== 'news')
      throw new NotFoundException('কনটেন্টের ধরন পাওয়া যায়নি');
    const [row] = await this.db
      .select()
      .from(news)
      .where(
        and(
          eq(news.schoolId, schoolId),
          eq(news.id, id),
          eq(news.isPublished, true),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException('খবর পাওয়া যায়নি');
    return { data: { ...row, body: row.details } };
  }

  async create(
    resource: string,
    user: AuthUser,
    value: Record<string, unknown>,
  ) {
    const table = this.table(resource);
    const result = await this.db
      .insert(table)
      .values({ ...value, schoolId: user.schoolId } as never)
      .returning();
    return { data: result[0] };
  }

  async publicMessage(
    resource: 'contactMessages' | 'complaints',
    schoolId: string,
    value: Record<string, unknown>,
  ) {
    const table = resource === 'contactMessages' ? contactMessages : complaints;
    const result = await this.db
      .insert(table)
      .values({ ...value, schoolId } as never)
      .returning({ id: table.id });
    return {
      data: { id: result[0]?.id, message: 'আপনার বার্তা গ্রহণ করা হয়েছে' },
    };
  }

  async update(
    resource: string,
    user: AuthUser,
    id: string,
    value: Record<string, unknown>,
  ) {
    const table = this.table(resource);
    const school = this.schoolColumn(resource as ContentResource);
    if (!school)
      throw new NotFoundException('কনটেন্টের প্রতিষ্ঠান নির্ধারণ করা যায়নি');
    const result = await this.db
      .update(table)
      .set({ ...value, updatedAt: new Date() } as never)
      .where(and(eq(table.id, id), eq(school, user.schoolId as never)))
      .returning();
    if (!result[0]) throw new NotFoundException('কনটেন্ট পাওয়া যায়নি');
    return { data: result[0] };
  }

  async remove(resource: string, user: AuthUser, id: string) {
    const table = this.table(resource);
    const school = this.schoolColumn(resource as ContentResource);
    if (!school)
      throw new NotFoundException('কনটেন্টের প্রতিষ্ঠান নির্ধারণ করা যায়নি');
    const result = await this.db
      .delete(table)
      .where(and(eq(table.id, id), eq(school, user.schoolId as never)))
      .returning({ id: table.id });
    if (!result[0]) throw new NotFoundException('কনটেন্ট পাওয়া যায়নি');
    return { data: { id: result[0].id } };
  }

  async children(
    kind: 'menuItems' | 'serviceBoxLinks' | 'galleryItems',
    parentId: string,
    schoolId: string,
  ) {
    if (kind === 'menuItems') {
      const parent = await this.db
        .select({ id: menus.id })
        .from(menus)
        .where(and(eq(menus.id, parentId), eq(menus.schoolId, schoolId)))
        .limit(1);
      return {
        data: parent[0]
          ? await this.db
              .select()
              .from(menuItems)
              .where(eq(menuItems.menuId, parentId))
              .orderBy(asc(menuItems.orderIndex))
          : [],
      };
    }
    if (kind === 'serviceBoxLinks') {
      const parent = await this.db
        .select({ id: serviceBoxes.id })
        .from(serviceBoxes)
        .where(
          and(
            eq(serviceBoxes.id, parentId),
            eq(serviceBoxes.schoolId, schoolId),
          ),
        )
        .limit(1);
      return {
        data: parent[0]
          ? await this.db
              .select()
              .from(serviceBoxLinks)
              .where(eq(serviceBoxLinks.serviceBoxId, parentId))
              .orderBy(asc(serviceBoxLinks.orderIndex))
          : [],
      };
    }
    const parent = await this.db
      .select({ id: galleries.id })
      .from(galleries)
      .where(and(eq(galleries.id, parentId), eq(galleries.schoolId, schoolId)))
      .limit(1);
    return {
      data: parent[0]
        ? await this.db
            .select()
            .from(galleryItems)
            .where(eq(galleryItems.galleryId, parentId))
            .orderBy(asc(galleryItems.orderIndex))
        : [],
    };
  }

  async createChild(
    kind: 'menuItems' | 'serviceBoxLinks' | 'galleryItems',
    parentId: string,
    user: AuthUser,
    value: Record<string, unknown>,
  ) {
    const allowed = await this.children(kind, parentId, user.schoolId);
    if (!allowed)
      throw new NotFoundException('প্যারেন্ট কনটেন্ট পাওয়া যায়নি');
    const table =
      kind === 'menuItems'
        ? menuItems
        : kind === 'serviceBoxLinks'
          ? serviceBoxLinks
          : galleryItems;
    const parentKey =
      kind === 'menuItems'
        ? 'menuId'
        : kind === 'serviceBoxLinks'
          ? 'serviceBoxId'
          : 'galleryId';
    const result = await this.db
      .insert(table)
      .values({ ...value, [parentKey]: parentId } as never)
      .returning();
    return { data: result[0] };
  }

  async updateChild(
    kind: 'menuItems' | 'serviceBoxLinks' | 'galleryItems',
    parentId: string,
    id: string,
    user: AuthUser,
    value: Record<string, unknown>,
  ) {
    const existing = await this.children(kind, parentId, user.schoolId);
    const table =
      kind === 'menuItems'
        ? menuItems
        : kind === 'serviceBoxLinks'
          ? serviceBoxLinks
          : galleryItems;
    if (!existing.data.some((item) => item.id === id))
      throw new NotFoundException('কনটেন্ট পাওয়া যায়নি');
    const result = await this.db
      .update(table)
      .set({ ...value, updatedAt: new Date() } as never)
      .where(eq(table.id, id))
      .returning();
    return { data: result[0] };
  }

  async removeChild(
    kind: 'menuItems' | 'serviceBoxLinks' | 'galleryItems',
    parentId: string,
    id: string,
    user: AuthUser,
  ) {
    const existing = await this.children(kind, parentId, user.schoolId);
    const table =
      kind === 'menuItems'
        ? menuItems
        : kind === 'serviceBoxLinks'
          ? serviceBoxLinks
          : galleryItems;
    if (!existing.data.some((item) => item.id === id))
      throw new NotFoundException('কনটেন্ট পাওয়া যায়নি');
    const result = await this.db
      .delete(table)
      .where(eq(table.id, id))
      .returning({ id: table.id });
    return { data: { id: result[0]?.id ?? id } };
  }
}
