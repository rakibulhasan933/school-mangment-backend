import { describe, expect, it, vi } from 'vitest';
import { makeFakeDb, type FakeRow } from '../testing/fake-db.js';

const holder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../db/index.js', () => ({
  createDb: () => holder.current,
}));

import { ContentService } from './content.service.js';
import type { AuthUser } from '../auth/auth.types.js';

const admin = {
  id: 'admin-1',
  schoolId: 'school-1',
  role: 'ADMIN',
  displayNameBn: 'প্রশাসক',
} as AuthUser;

function setup(seed: Record<string, FakeRow[]>) {
  const fake = makeFakeDb(seed);
  holder.current = fake.db;
  return { service: new ContentService(), fake };
}

describe('ContentService.remove (B3)', () => {
  it('actually deletes a notice in the caller school', async () => {
    const { service, fake } = setup({});
    const result = await service.remove('notices', admin, 'notice-1');
    expect(result.data.id).toBeDefined();
    expect(fake.deleted).toEqual(['notices']);
  });

  it('deleting a menu removes its menu items first (no FK dead-end)', async () => {
    const { service, fake } = setup({
      menus: [{ id: 'menu-1', schoolId: 'school-1' }],
    });
    await service.remove('menus', admin, 'menu-1');
    expect(fake.deleted).toEqual(['menu_items', 'menus']);
  });

  it('deleting a gallery removes its photos first', async () => {
    const { service, fake } = setup({
      galleries: [{ id: 'g-1', schoolId: 'school-1' }],
    });
    await service.remove('galleries', admin, 'g-1');
    expect(fake.deleted).toEqual(['gallery_items', 'galleries']);
  });
});

describe('ContentService complaints integrity (B7)', () => {
  it('a public complaint is inserted into complaints — never contact_messages — and lists back from complaints', async () => {
    const { service, fake } = setup({
      complaints: [
        { id: 'c-1', name: 'QA', subject: 'ফি', description: 'অভিযোগ', status: 'received' },
      ],
      contact_messages: [],
    });
    const created = await service.publicMessage('complaints', 'school-1', {
      name: 'QA',
      mobile: '01700000000',
      subject: 'ফি',
      description: 'অভিযোগ',
    });
    expect(created.data.id).toBeDefined();
    expect(fake.inserted.map((row) => row.table)).toEqual(['complaints']);
    const listed = await service.list('complaints', 'school-1');
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toMatchObject({ subject: 'ফি' });
    const inbox = await service.list('contactMessages', 'school-1');
    expect(inbox.data).toHaveLength(0);
  });
});

describe('ContentService.list (B11)', () => {
  it('homepageBlocks list returns the seeded blocks for the school', async () => {
    const blocks = Array.from({ length: 20 }, (_, i) => ({
      id: `block-${i}`,
      schoolId: 'school-1',
      key: `k${i}`,
      titleBn: `ব্লক ${i}`,
      isEnabled: true,
    }));
    const { service } = setup({ homepage_blocks: blocks });
    const { data } = await service.list('homepageBlocks', 'school-1');
    expect(data).toHaveLength(20);
  });
});

describe('ContentService nullable banner/gallery images (Round 7, Fix 1)', () => {
  it('creating a banner without imageUrl succeeds and reads back imageUrl: null', async () => {
    const { service, fake } = setup({
      banners: [
        {
          id: 'b-1',
          schoolId: 'school-1',
          imageUrl: null,
          titleBn: 'শিক্ষাই জাতির মেরুদণ্ড',
        },
      ],
    });
    const created = await service.create('banners', admin, {
      titleBn: 'নতুন ব্যানার',
      captionBn: 'ক্যাপশন',
      orderIndex: 0,
    });
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0].table).toBe('banners');
    expect(fake.inserted[0].values.imageUrl).toBeNull();
    expect(created.data).toMatchObject({ imageUrl: null });
    // Read-back: a stored banner row serialises imageUrl as null.
    const listed = await service.list('banners', 'school-1');
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toHaveProperty('imageUrl', null);
    expect(listed.data[0].imageUrl).toBeNull();
  });

  it('creating a banner with an empty or explicit-null imageUrl also stores null, a real URL is kept', async () => {
    const { service, fake } = setup({});
    const empty = await service.create('banners', admin, {
      titleBn: 'খালি ছবি',
      imageUrl: '',
    });
    expect(empty.data.imageUrl).toBeNull();
    const explicitNull = await service.create('banners', admin, {
      titleBn: 'ছবি নেই',
      imageUrl: null,
    });
    expect(explicitNull.data.imageUrl).toBeNull();
    const withImage = await service.create('banners', admin, {
      titleBn: 'ছবিসহ',
      imageUrl: 'https://utfs.io/f/banner.jpg',
    });
    expect(withImage.data.imageUrl).toBe('https://utfs.io/f/banner.jpg');
    expect(fake.inserted.map((row) => row.values.imageUrl)).toEqual([
      null,
      null,
      'https://utfs.io/f/banner.jpg',
    ]);
  });

  it('updating a banner may clear its image, and omitting imageUrl leaves it untouched', async () => {
    const { service, fake } = setup({});
    await service.update('banners', admin, 'b-1', { imageUrl: '' });
    expect(fake.updated[0].values.imageUrl).toBeNull();
    await service.update('banners', admin, 'b-1', { titleBn: 'শিরোনাম' });
    expect(fake.updated[1].values).not.toHaveProperty('imageUrl');
  });

  it('creating a gallery item without imageUrl succeeds and reads back imageUrl: null', async () => {
    const { service, fake } = setup({
      galleries: [{ id: 'g-1', schoolId: 'school-1', titleBn: 'গ্যালারি' }],
      gallery_items: [
        {
          id: 'gi-1',
          galleryId: 'g-1',
          imageUrl: null,
          captionBn: 'বিদ্যালয় প্রাঙ্গণ',
          orderIndex: 0,
        },
      ],
    });
    const created = await service.createChild('galleryItems', 'g-1', admin, {
      captionBn: 'নতুন ছবি',
      orderIndex: 1,
    });
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0].table).toBe('gallery_items');
    expect(fake.inserted[0].values.imageUrl).toBeNull();
    expect(created.data).toMatchObject({ imageUrl: null, galleryId: 'g-1' });
    // Read-back through the children listing serialises null, not undefined.
    const listed = await service.children('galleryItems', 'g-1', 'school-1');
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toHaveProperty('imageUrl', null);
    expect(listed.data[0].imageUrl).toBeNull();
  });

  it('creating a gallery item with a real imageUrl keeps it', async () => {
    const { service } = setup({
      galleries: [{ id: 'g-1', schoolId: 'school-1' }],
      gallery_items: [],
    });
    const created = await service.createChild('galleryItems', 'g-1', admin, {
      captionBn: 'ছবি',
      imageUrl: 'https://utfs.io/f/photo.jpg',
    });
    expect(created.data.imageUrl).toBe('https://utfs.io/f/photo.jpg');
  });
});

describe('ContentService.listPublishedNotices (B9)', () => {
  it('serves public + teacher notices, hides student-targeted ones', async () => {
    const { service } = setup({
      notices: [
        { id: 'n1', audience: 'public', audienceClass: null, isPublished: true },
        { id: 'n2', audience: 'teachers', audienceClass: null, isPublished: true },
        { id: 'n3', audience: 'student', audienceClass: 'cls-6', isPublished: true },
      ],
    });
    const { data } = await service.listPublishedNotices('school-1');
    expect(data.map((row) => row.id)).toEqual(['n1', 'n2']);
  });
});
