import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityKey, CapabilityScope } from '@baogiang/contracts';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

function authWith(key?: CapabilityKey, scope: CapabilityScope = 'SCHOOL_WIDE', resourceId?: string) {
  return { ...normalAuth, capabilities: key ? [{ key, scope, ...(resourceId ? { resourceId } : {}) }] : [] };
}

describe('capability-aware navigation', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([
    ['USER_MANAGE', 'Người dùng'], ['SUBJECT_GROUP_MANAGE', 'Tổ chuyên môn'], ['SUBJECT_MANAGE', 'Môn học'],
    ['CAPABILITY_GRANT', 'Cấp quyền'], ['AUDIT_VIEW', 'Nhật ký'], ['ADDITIONAL_DUTY_CATALOG_MANAGE', 'Danh mục kiêm nhiệm'],
    ['ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', 'Phân công kiêm nhiệm'],
    ['ACADEMIC_STRUCTURE_MANAGE', 'Cấu trúc năm học'],
    ['BUSINESS_CONFIGURATION_MANAGE', 'Chính sách nghiệp vụ'],
    ['PPCT_MANAGE', 'Áp dụng chuyên đề'],
  ] as const)('shows %s only when effective school-wide', async (key, label) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith(key))));
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: label })).length).toBeGreaterThanOrEqual(1);
  });

  it('does not derive business navigation from SYSTEM_ADMIN', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith('SYSTEM_ADMIN'))));
    renderApp('/');
    await screen.findByRole('heading', { name: /chào/i });
    expect(screen.queryByRole('link', { name: 'Người dùng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cấp quyền' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cấu trúc năm học' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Phân công giảng dạy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Phân công chủ nhiệm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Chính sách nghiệp vụ' })).not.toBeInTheDocument();
  });

  it('shows both distinct subject-management assignment routes and renders the teaching ledger', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
      ? jsonResponse(authWith('SUBJECT_MANAGE'))
      : jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/phan-cong-giang-day');
    expect(await screen.findByRole('heading', { name: 'Phân công giảng dạy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Phân công môn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Phân công giảng dạy' })).toBeInTheDocument();
  });

  it.each([undefined, 'SYSTEM_ADMIN', 'USER_MANAGE', 'ACADEMIC_STRUCTURE_MANAGE'] as const)(
    'denies the teaching-assignment route without school-wide SUBJECT_MANAGE (%s)',
    async (key) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith(key))));
      renderApp('/quan-tri/phan-cong-giang-day');
      expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Phân công giảng dạy' })).not.toBeInTheDocument();
    },
  );

  it.each([undefined, 'SYSTEM_ADMIN', 'USER_MANAGE', 'SUBJECT_MANAGE', 'ACADEMIC_STRUCTURE_MANAGE'] as const)(
    'denies the Homeroom route without exact school-wide capability (%s)',
    async (key) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith(key))));
      renderApp('/quan-tri/phan-cong-chu-nhiem');
      expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Phân công chủ nhiệm' })).not.toBeInTheDocument();
    },
  );

  it('shows and opens the Homeroom workspace only for HOMEROOM_ASSIGNMENT_MANAGE', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
      ? jsonResponse(authWith('HOMEROOM_ASSIGNMENT_MANAGE'))
      : jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/phan-cong-chu-nhiem');
    expect(await screen.findByRole('heading', { name: 'Phân công chủ nhiệm' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Phân công chủ nhiệm' })).toBeInTheDocument();
  });

  it('blocks academic structure for SYSTEM_ADMIN without the business capability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith('SYSTEM_ADMIN'))));
    renderApp('/quan-tri/cau-truc-nam-hoc');
    expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cấu trúc năm học' })).not.toBeInTheDocument();
  });

  it('allows the academic register only with the school-wide academic capability', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
      ? jsonResponse(authWith('ACADEMIC_STRUCTURE_MANAGE'))
      : jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/cau-truc-nam-hoc');
    expect(await screen.findByRole('heading', { name: 'Cấu trúc năm học' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cấu trúc năm học' })).toBeInTheDocument();
  });

  it('denies duty assignment navigation and direct route for an unrelated subject-group capability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith('SUBJECT_GROUP_LEAD', 'SUBJECT_GROUP', 'group-1'))));
    renderApp('/');
    await screen.findByRole('heading', { name: /chào/i });
    expect(screen.queryByRole('link', { name: 'Phân công kiêm nhiệm' })).not.toBeInTheDocument();
  });

  it('blocks the duty assignment direct route for an unrelated subject-group capability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith('SUBJECT_GROUP_LEAD', 'SUBJECT_GROUP', 'group-1'))));
    renderApp('/quan-tri/kiem-nhiem/phan-cong');
    expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
  });

  it('allows duty assignment navigation and direct route for the exact subject-group capability', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
      ? jsonResponse(authWith('ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', 'SUBJECT_GROUP', 'group-1'))
      : jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/kiem-nhiem/phan-cong');
    expect((await screen.findAllByRole('link', { name: 'Phân công kiêm nhiệm' })).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByRole('heading', { name: 'Kiêm nhiệm nhân sự' })).toBeInTheDocument();
  });

  it('blocks a direct management route before rendering its page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(normalAuth)));
    renderApp('/quan-tri/nguoi-dung');
    expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Người dùng' })).not.toBeInTheDocument();
  });

  it('renders profile from auth/me without deriving a role', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith('TEACHER_BASE', 'PERSONAL'))));
    renderApp('/ho-so');
    expect(await screen.findByRole('heading', { name: normalAuth.user.displayName })).toBeInTheDocument();
    expect(screen.getByText(normalAuth.user.username)).toBeInTheDocument();
    expect(screen.getByText(/công việc giáo viên cơ bản/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/vai trò/i)).not.toBeInTheDocument());
  });

  it('shows Áp dụng chuyên đề for SUBJECT-scoped PPCT_MANAGE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith('PPCT_MANAGE', 'SUBJECT', 'sub-1'))));
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: 'Áp dụng chuyên đề' })).length).toBeGreaterThanOrEqual(1);
  });

  it.each([undefined, 'SYSTEM_ADMIN', 'SUBJECT_MANAGE', 'ACADEMIC_STRUCTURE_MANAGE', 'USER_MANAGE'] as const)(
    'denies the PPCT specialized study route without PPCT_MANAGE (%s)',
    async (key) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith(key))));
      renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
      expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Áp dụng chuyên đề' })).not.toBeInTheDocument();
    },
  );

  it('allows PPCT specialized study route for SUBJECT-scoped PPCT_MANAGE', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(authWith('PPCT_MANAGE', 'SUBJECT', 'sub-1'));
      if (url.includes('/ppct-options/academic-years')) {
        return jsonResponse({ items: [{ id: 'year-1', code: '2026-2027', name: 'Năm 2026-2027' }], page: 1, pageSize: 100, total: 1 });
      }
      if (url.includes('/ppct-options/academic-years/year-1')) {
        return jsonResponse({
          academicYear: { id: 'year-1', code: '2026-2027', name: 'Năm 2026-2027' },
          classes: [],
          subjects: [{ id: 'sub-1', code: 'TOAN', name: 'Toán học', status: 'ACTIVE' }],
        });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
    expect(await screen.findByRole('heading', { name: 'Áp dụng chuyên đề' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Áp dụng chuyên đề' })).toBeInTheDocument();
  });
});
