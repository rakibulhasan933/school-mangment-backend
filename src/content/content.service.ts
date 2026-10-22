import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import {
  banners,
  complaints,
  contactMessages,
  downloads,
  events,
  galleries,
  galleryItems,
  homepageBlocks,
  importantLinks,
  menuItems,
  messages,
  menus,
  news,
  notices,
  pages,
  quotes,
  schools,
  serviceBoxes,
  serviceBoxLinks,
  students,
  teachers,
  users,
} from '../db/schema.js';
import type { AuthUser } from '../auth/auth.types.js';

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
} as const;
export type ContentResource = keyof typeof resources;

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
    const [teacherRows, studentRows] = await Promise.all([
      this.db
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
        .limit(8),
      this.db
        .select({
          id: users.id,
          nameBn: users.displayNameBn,
          registrationNumber: users.registrationNumber,
        })
        .from(users)
        .where(
          and(
            eq(users.schoolId, schoolId),
            eq(users.role, 'STUDENT'),
            eq(users.isActive, true),
          ),
        )
        .orderBy(asc(users.registrationNumber))
        .limit(6),
    ]);
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
        notices: noticeRows,
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
      case 'notices':
        return {
          data: await this.db
            .select()
            .from(notices)
            .where(
              and(
                eq(notices.schoolId, schoolId),
                eq(notices.isPublished, true),
                or(isNull(notices.publishAt), lte(notices.publishAt, now)),
                or(isNull(notices.expiresAt), gt(notices.expiresAt, now)),
              ),
            ),
        };
      case 'news':
        return {
          data: await this.db
            .select()
            .from(news)
            .where(
              and(eq(news.schoolId, schoolId), eq(news.isPublished, true)),
            ),
        };
      case 'galleries':
        return {
          data: await this.db
            .select()
            .from(galleries)
            .where(
              and(
                eq(galleries.schoolId, schoolId),
                eq(galleries.isPublished, true),
              ),
            ),
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
      default:
        return this.list(resource, schoolId);
    }
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
}
