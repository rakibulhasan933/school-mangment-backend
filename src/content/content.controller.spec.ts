import { describe, expect, it, vi } from 'vitest';
import { ContentController } from './content.controller.js';
import {
  isPubliclyVisible,
  isStaffOnlyAudience,
} from './content.service.js';
import type { ContentService } from './content.service.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';

function controllerWith(service: Partial<ContentService>) {
  return new ContentController(service as ContentService);
}

const request = {
  user: { schoolId: 'school-1', role: 'ADMIN' },
} as unknown as AuthenticatedRequest;

describe('ContentController.remove', () => {
  it('delegates deletion to the service with resource, user and id', async () => {
    const remove = vi.fn().mockResolvedValue({ data: { id: 'row-1' } });
    const controller = controllerWith({ remove });
    await expect(
      controller.remove('committee', request, 'row-1'),
    ).resolves.toEqual({ data: { id: 'row-1' } });
    expect(remove).toHaveBeenCalledWith('committee', request.user, 'row-1');
  });

  it('passes videos and holidays resources through unchanged', async () => {
    const remove = vi.fn().mockResolvedValue({ data: { id: 'row-2' } });
    const controller = controllerWith({ remove });
    await controller.remove('videos', request, 'row-2');
    await controller.remove('holidays', request, 'row-2');
    expect(remove).toHaveBeenNthCalledWith(1, 'videos', request.user, 'row-2');
    expect(remove).toHaveBeenNthCalledWith(
      2,
      'holidays',
      request.user,
      'row-2',
    );
  });
});

describe('ContentController.removeChild', () => {
  it('maps each parent resource to its child kind', async () => {
    const removeChild = vi.fn().mockResolvedValue({ data: { id: 'c-1' } });
    const controller = controllerWith({ removeChild });
    await controller.removeChild('menus', 'p-1', request, 'c-1');
    await controller.removeChild('serviceBoxes', 'p-1', request, 'c-1');
    await controller.removeChild('galleries', 'p-1', request, 'c-1');
    expect(removeChild).toHaveBeenNthCalledWith(
      1,
      'menuItems',
      'p-1',
      'c-1',
      request.user,
    );
    expect(removeChild).toHaveBeenNthCalledWith(
      2,
      'serviceBoxLinks',
      'p-1',
      'c-1',
      request.user,
    );
    expect(removeChild).toHaveBeenNthCalledWith(
      3,
      'galleryItems',
      'p-1',
      'c-1',
      request.user,
    );
  });
});

describe('isPubliclyVisible', () => {
  it('keeps rows without any visibility flag visible', () => {
    expect(isPubliclyVisible({ titleBn: 'ইভেন্ট' })).toBe(true);
  });
  it('hides rows whose isPublished flag is off', () => {
    expect(isPubliclyVisible({ isPublished: false })).toBe(false);
    expect(isPubliclyVisible({ isPublished: true })).toBe(true);
  });
  it('hides rows whose isEnabled or isActive flag is off', () => {
    expect(isPubliclyVisible({ isEnabled: false })).toBe(false);
    expect(isPubliclyVisible({ isActive: false })).toBe(false);
    expect(isPubliclyVisible({ isEnabled: true, isActive: true })).toBe(true);
  });
});

describe('isStaffOnlyAudience', () => {
  it('treats teacher/admin/staff audiences as staff-only', () => {
    expect(isStaffOnlyAudience('teacher')).toBe(true);
    expect(isStaffOnlyAudience('Teachers')).toBe(true);
    expect(isStaffOnlyAudience('admin')).toBe(true);
    expect(isStaffOnlyAudience('staff')).toBe(true);
  });
  it('keeps public and student audiences public', () => {
    expect(isStaffOnlyAudience('public')).toBe(false);
    expect(isStaffOnlyAudience('student')).toBe(false);
    expect(isStaffOnlyAudience(null)).toBe(false);
    expect(isStaffOnlyAudience(undefined)).toBe(false);
  });
});
