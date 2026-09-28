import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityKey, CapabilityScope, ScopedCapability } from '@baogiang/contracts';
import { canManageSpecialProgrammes } from '../lib/capabilities';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

function authWith(key?: CapabilityKey, scope: CapabilityScope = 'SCHOOL_WIDE', resourceId?: string) {
  return {
    ...normalAuth,
    capabilities: key ? [{ key, scope, ...(resourceId ? { resourceId } : {}) }] : [],
  };
}

describe('Special Programme Capability & Routing (P4-074B Section 20)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('canManageSpecialProgrammes helper', () => {
    it('returns true for APPROVAL_PRINCIPAL with SCHOOL_WIDE', () => {
      const caps: ScopedCapability[] = [{ key: 'APPROVAL_PRINCIPAL', scope: 'SCHOOL_WIDE' }];
      expect(canManageSpecialProgrammes(caps)).toBe(true);
    });

    it('returns true for APPROVAL_VICE_PRINCIPAL with SCHOOL_WIDE', () => {
      const caps: ScopedCapability[] = [{ key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' }];
      expect(canManageSpecialProgrammes(caps)).toBe(true);
    });

    it('returns true for GDDP_COORDINATOR with ACTIVITY', () => {
      const caps: ScopedCapability[] = [{ key: 'GDDP_COORDINATOR', scope: 'ACTIVITY' }];
      expect(canManageSpecialProgrammes(caps)).toBe(true);
    });

    it('returns true for HĐTN_COORDINATOR with ACTIVITY', () => {
      const caps: ScopedCapability[] = [{ key: 'HĐTN_COORDINATOR', scope: 'ACTIVITY' }];
      expect(canManageSpecialProgrammes(caps)).toBe(true);
    });

    it('returns true for coordinator with resourceId', () => {
      const caps: ScopedCapability[] = [
        { key: 'GDDP_COORDINATOR', scope: 'ACTIVITY', resourceId: 'master-gddp-1' },
      ];
      expect(canManageSpecialProgrammes(caps)).toBe(true);
    });

    it('returns false for TEACHER_BASE-only', () => {
      const caps: ScopedCapability[] = [{ key: 'TEACHER_BASE', scope: 'PERSONAL' }];
      expect(canManageSpecialProgrammes(caps)).toBe(false);
    });

    it('returns false for unrelated ACTIVITY capability', () => {
      const caps: ScopedCapability[] = [{ key: 'SPECIAL_ACTIVITY_MANAGE', scope: 'ACTIVITY' }];
      expect(canManageSpecialProgrammes(caps)).toBe(false);
    });

    it('returns false for unrelated administrative capabilities without special programme grant', () => {
      const caps: ScopedCapability[] = [
        { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'ACADEMIC_STRUCTURE_MANAGE', scope: 'SCHOOL_WIDE' },
        { key: 'SYSTEM_ADMIN', scope: 'SCHOOL_WIDE' },
      ];
      expect(canManageSpecialProgrammes(caps)).toBe(false);
    });
  });

  describe('Navigation & Route Guard', () => {
    it.each([
      ['APPROVAL_PRINCIPAL', 'SCHOOL_WIDE', undefined],
      ['APPROVAL_VICE_PRINCIPAL', 'SCHOOL_WIDE', undefined],
      ['GDDP_COORDINATOR', 'ACTIVITY', undefined],
      ['HĐTN_COORDINATOR', 'ACTIVITY', undefined],
      ['GDDP_COORDINATOR', 'ACTIVITY', 'res-1'],
    ] as const)(
      'shows navigation link for %s with %s (resourceId: %s)',
      async (key, scope, resourceId) => {
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/auth/me')) {
            return jsonResponse(authWith(key, scope, resourceId));
          }
          if (url.includes('/workspace/options')) {
            return jsonResponse({ academicYears: [], masters: [] });
          }
          return jsonResponse({});
        });
        vi.stubGlobal('fetch', fetchMock);

        renderApp('/');
        expect((await screen.findAllByRole('link', { name: 'HĐTN-HN & GDĐP' })).length).toBeGreaterThanOrEqual(1);
      },
    );

    it('hides navigation link for TEACHER_BASE-only', async () => {
      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) {
          return jsonResponse(authWith('TEACHER_BASE', 'PERSONAL'));
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderApp('/');
      await screen.findByRole('heading', { name: /chào/i });
      expect(screen.queryByRole('link', { name: 'HĐTN-HN & GDĐP' })).not.toBeInTheDocument();
    });

    it('blocks /quan-tri/chuong-trinh-dac-thu for TEACHER_BASE-only via CapabilityRoute', async () => {
      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) {
          return jsonResponse(authWith('TEACHER_BASE', 'PERSONAL'));
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderApp('/quan-tri/chuong-trinh-dac-thu');
      expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Kế hoạch HĐTN-HN & GDĐP' })).not.toBeInTheDocument();
    });

    it('allows /quan-tri/chuong-trinh-dac-thu for authorized coordinator', async () => {
      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) {
          return jsonResponse(authWith('HĐTN_COORDINATOR', 'ACTIVITY'));
        }
        if (url.includes('/workspace/options')) {
          return jsonResponse({
            academicYears: [{ id: 'year-1', code: '2024-2025', name: 'Năm học 2024 - 2025' }],
            masters: [],
          });
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderApp('/quan-tri/chuong-trinh-dac-thu');
      expect(await screen.findByRole('heading', { name: 'Kế hoạch HĐTN-HN & GDĐP' })).toBeInTheDocument();
    });
  });
});
