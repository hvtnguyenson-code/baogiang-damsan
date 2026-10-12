import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const auth = (...capabilities: Array<{ key: string; scope: string; resourceId?: string }>) => ({
  ...normalAuth,
  capabilities,
});

describe('AUD-05 CapabilitiesPage pagination completeness', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const fullAdminAuth = auth(
    { key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
    { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
    { key: 'SUBJECT_GROUP_MANAGE', scope: 'SCHOOL_WIDE' },
    { key: 'SUBJECT_MANAGE', scope: 'SCHOOL_WIDE' },
  );

  it('allows selecting a user from record 101+ across pages and preserves selection when navigating pages', async () => {
    const page1Users = Array.from({ length: 100 }, (_, i) => ({
      id: `u-${i + 1}`,
      username: `gv${i + 1}`,
      status: 'ACTIVE',
      profile: { displayName: `Giáo viên ${i + 1}` },
    }));

    const page2Users = [
      {
        id: 'u-105',
        username: 'gv105',
        status: 'ACTIVE',
        profile: { displayName: 'Thầy Một Lẻ Năm' },
      },
    ];

    const definitions = {
      items: [
        {
          key: 'TEACHER_BASE',
          description: 'Quyền giáo viên cơ bản',
          allowedScopeTypes: ['SCHOOL_WIDE', 'PERSONAL'],
          isSystem: false,
          isActive: true,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(fullAdminAuth);
      if (url.includes('/capabilities')) return jsonResponse(definitions);
      if (url.includes('/users') && !url.includes('capability-grants')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Users, page: 1, pageSize: 100, total: 105 });
        if (page === 2) return jsonResponse({ items: page2Users, page: 2, pageSize: 100, total: 105 });
        return jsonResponse({ items: [], page, pageSize: 100, total: 105 });
      }
      if (url.includes('/capability-grants')) {
        return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    // Wait for initial load
    expect(await screen.findByRole('heading', { name: 'Cấp quyền mới' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Chuyển trang người dùng' })).toHaveTextContent(/105 người dùng/);

    // Navigate to page 2 (records 101+)
    const nextBtn = () => within(screen.getByRole('navigation', { name: 'Chuyển trang người dùng' })).getByRole('button', { name: 'Trang sau' });
    const prevBtn = () => within(screen.getByRole('navigation', { name: 'Chuyển trang người dùng' })).getByRole('button', { name: 'Trang trước' });

    await user.click(nextBtn());
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Chuyển trang người dùng' })).toHaveTextContent(/Trang 2 \/ 2/);
    });

    // Option for user 105 is now in dropdown
    const userSelect = screen.getByLabelText('Người nhận');
    expect(within(userSelect).getByRole('option', { name: /Thầy Một Lẻ Năm — gv105/i })).toBeInTheDocument();

    // Select user 105
    await user.selectOptions(userSelect, 'u-105');
    expect(userSelect).toHaveValue('u-105');

    // History section shows the selected user's name
    expect(await screen.findByRole('heading', { name: 'Lịch sử quyền của Thầy Một Lẻ Năm' })).toBeInTheDocument();

    // Now navigate back to page 1
    await user.click(prevBtn());

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Chuyển trang người dùng' })).toHaveTextContent(/Trang 1 \/ 2/);
    });

    // Crucial check: user selection is NOT lost or reset!
    expect(userSelect).toHaveValue('u-105');
    expect(within(userSelect).getByRole('option', { name: /Thầy Một Lẻ Năm — gv105/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lịch sử quyền của Thầy Một Lẻ Năm' })).toBeInTheDocument();
  });

  it('allows selecting subject groups beyond page 1 and preserves selected group across page changes', async () => {
    const page1Groups = Array.from({ length: 100 }, (_, i) => ({
      id: `g-${i + 1}`,
      code: `TO_${i + 1}`,
      name: `Tổ chuyên môn ${i + 1}`,
      status: 'ACTIVE',
    }));

    const page2Groups = [
      {
        id: 'g-105',
        code: 'GDTC',
        name: 'Tổ Giáo dục thể chất',
        status: 'ACTIVE',
      },
    ];

    const definitions = {
      items: [
        {
          key: 'SUBJECT_GROUP_LEAD',
          description: 'Tổ trưởng chuyên môn',
          allowedScopeTypes: ['SUBJECT_GROUP'],
          isSystem: false,
          isActive: true,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(fullAdminAuth);
      if (url.includes('/capabilities')) return jsonResponse(definitions);
      if (url.includes('/users') && !url.includes('capability-grants')) {
        return jsonResponse({
          items: [{ id: 'u-1', username: 'gv01', status: 'ACTIVE', profile: { displayName: 'Giáo viên 1' } }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (url.includes('/subject-groups')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Groups, page: 1, pageSize: 100, total: 105 });
        if (page === 2) return jsonResponse({ items: page2Groups, page: 2, pageSize: 100, total: 105 });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    await user.selectOptions(await screen.findByLabelText('Người nhận'), 'u-1');
    await user.selectOptions(screen.getByLabelText('Quyền'), 'SUBJECT_GROUP_LEAD');
    await user.selectOptions(screen.getByLabelText('Phạm vi'), 'SUBJECT_GROUP');

    // Subject group pagination is rendered
    expect(await screen.findByRole('navigation', { name: 'Chuyển trang tổ bộ môn' })).toHaveTextContent(/105 tổ/);

    const groupNextBtn = () => within(screen.getByRole('navigation', { name: 'Chuyển trang tổ bộ môn' })).getByRole('button', { name: 'Trang sau' });
    const groupPrevBtn = () => within(screen.getByRole('navigation', { name: 'Chuyển trang tổ bộ môn' })).getByRole('button', { name: 'Trang trước' });

    // Navigate to page 2 (records 101+)
    await user.click(groupNextBtn());
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Chuyển trang tổ bộ môn' })).toHaveTextContent(/Trang 2 \/ 2/);
    });

    const resourceSelect = screen.getByLabelText('Tổ chuyên môn');
    expect(within(resourceSelect).getByRole('option', { name: /GDTC — Tổ Giáo dục thể chất/i })).toBeInTheDocument();

    // Select group on page 2
    await user.selectOptions(resourceSelect, 'g-105');
    expect(resourceSelect).toHaveValue('g-105');

    // Navigate back to page 1
    await user.click(groupPrevBtn());
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Chuyển trang tổ bộ môn' })).toHaveTextContent(/Trang 1 \/ 2/);
    });

    // Selection is preserved!
    expect(resourceSelect).toHaveValue('g-105');
    expect(within(resourceSelect).getByRole('option', { name: /GDTC — Tổ Giáo dục thể chất/i })).toBeInTheDocument();
  });

  it('paginates active capability definitions table without cutting off records', async () => {
    const page1Defs = Array.from({ length: 100 }, (_, i) => ({
      key: `CAP_${i + 1}`,
      description: `Mô tả quyền ${i + 1}`,
      allowedScopeTypes: ['SCHOOL_WIDE'],
      isSystem: false,
      isActive: true,
    }));

    const page2Defs = [
      {
        key: 'SPECIAL_CAP_101',
        description: 'Quyền đặc biệt trang hai',
        allowedScopeTypes: ['SCHOOL_WIDE'],
        isSystem: true,
        isActive: true,
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(fullAdminAuth);
      if (url.includes('/capabilities')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Defs, page: 1, pageSize: 100, total: 101 });
        if (page === 2) return jsonResponse({ items: page2Defs, page: 2, pageSize: 100, total: 101 });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    // Wait for initial load
    expect(await screen.findByRole('heading', { name: 'Danh mục quyền đang hoạt động' })).toBeInTheDocument();

    const getTableRegion = () => screen.getByRole('region', { name: 'Danh mục quyền' });
    expect(within(getTableRegion()).getByText('Mô tả quyền 1')).toBeInTheDocument();
    expect(within(getTableRegion()).queryByText('Quyền đặc biệt trang hai')).not.toBeInTheDocument();

    const defNav = () => screen.getByRole('navigation', { name: 'Phân trang danh mục quyền' });
    expect(defNav()).toHaveTextContent(/101 bản ghi/);

    // Click next page on definitions table pagination
    await user.click(within(defNav()).getByRole('button', { name: 'Trang sau' }));

    // Page 2 renders the 101st definition in the table
    await waitFor(() => {
      expect(within(getTableRegion()).getByText('Quyền đặc biệt trang hai')).toBeInTheDocument();
      expect(within(getTableRegion()).queryByText('Mô tả quyền 1')).not.toBeInTheDocument();
      expect(defNav()).toHaveTextContent(/Trang 2 \/ 2/);
    });
  });

  it('paginates user grant history across pages, displaying active and revoked grants, and supports revoke mutation', async () => {
    const page1Grants = Array.from({ length: 100 }, (_, i) => ({
      id: `grant-${i + 1}`,
      userId: 'u-1',
      capabilityKey: 'TEACHER_BASE',
      scopeType: 'PERSONAL',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.000Z',
      revokedAt: null,
    }));

    const page2Grants = [
      {
        id: 'grant-101-revoked',
        userId: 'u-1',
        capabilityKey: 'TIMETABLE_MANAGE',
        scopeType: 'SCHOOL_WIDE',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2026-12-31T23:59:59.000Z',
        revokedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'grant-102-active',
        userId: 'u-1',
        capabilityKey: 'PPCT_MANAGE',
        scopeType: 'SCHOOL_WIDE',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2026-12-31T23:59:59.000Z',
        revokedAt: null,
      },
    ];

    let revokedCalled = false;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(fullAdminAuth);
      if (url.includes('/capabilities')) {
        return jsonResponse({
          items: [{ key: 'TEACHER_BASE', description: 'GV', allowedScopeTypes: ['PERSONAL'], isSystem: false, isActive: true }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (url.includes('/users') && !url.includes('capability-grants')) {
        return jsonResponse({
          items: [{ id: 'u-1', username: 'gv01', status: 'ACTIVE', profile: { displayName: 'Nguyễn Văn Một' } }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (url.includes('/capability-grants/grant-102-active/revoke') && init?.method === 'POST') {
        revokedCalled = true;
        return jsonResponse({ id: 'grant-102-active', revokedAt: '2026-10-11T00:00:00.000Z' });
      }
      if (url.includes('/users/u-1/capability-grants')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Grants, page: 1, pageSize: 100, total: 102 });
        if (page === 2) return jsonResponse({ items: page2Grants, page: 2, pageSize: 100, total: 102 });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    // Select user
    await user.selectOptions(await screen.findByLabelText('Người nhận'), 'u-1');

    // History table appears
    expect(await screen.findByRole('heading', { name: 'Lịch sử quyền của Nguyễn Văn Một' })).toBeInTheDocument();
    const getGrantsNav = () => screen.getByRole('navigation', { name: 'Phân trang lịch sử cấp quyền' });
    expect(getGrantsNav()).toHaveTextContent(/102 bản ghi/);

    // Navigate to page 2 of grants history (records 101+)
    await user.click(within(getGrantsNav()).getByRole('button', { name: 'Trang sau' }));

    // Verifies revoked grant has "Đã thu hồi" status badge
    expect(await screen.findByText('Đã thu hồi')).toBeInTheDocument();
    await waitFor(() => {
      expect(getGrantsNav()).toHaveTextContent(/Trang 2 \/ 2/);
    });

    // Revoke the active grant on page 2
    const revokeBtn = screen.getByRole('button', { name: 'Thu hồi' });
    await user.click(revokeBtn);

    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận thu hồi' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(revokedCalled).toBe(true);
      expect(screen.getByText(/đã thu hồi quyền; lịch sử được giữ lại/i)).toBeInTheDocument();
    });
  });

  it('correctly creates a grant targeting the selected user even after user page navigation', async () => {
    let createdPayload: unknown = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return fullAdminAuth ? jsonResponse(fullAdminAuth) : jsonResponse({});
      if (url.includes('/capabilities')) {
        return jsonResponse({
          items: [{ key: 'TEACHER_BASE', description: 'GV', allowedScopeTypes: ['PERSONAL'], isSystem: false, isActive: true }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (url.includes('/users') && !url.includes('capability-grants')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) {
          return jsonResponse({
            items: [{ id: 'u-1', username: 'gv01', status: 'ACTIVE', profile: { displayName: 'GV 1' } }],
            page: 1,
            pageSize: 100,
            total: 105,
          });
        }
        if (page === 2) {
          return jsonResponse({
            items: [{ id: 'u-105', username: 'gv105', status: 'ACTIVE', profile: { displayName: 'GV 105' } }],
            page: 2,
            pageSize: 100,
            total: 105,
          });
        }
      }
      if (url.includes('/users/u-105/capability-grants') && init?.method === 'POST') {
        createdPayload = JSON.parse(init.body as string);
        return jsonResponse({ id: 'new-grant', userId: 'u-105', capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }, 201);
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    // Go to page 2 of users (records 101+)
    const getUserNav = () => screen.getByRole('navigation', { name: 'Chuyển trang người dùng' });
    await waitFor(() => expect(getUserNav()).toBeInTheDocument());
    await user.click(within(getUserNav()).getByRole('button', { name: 'Trang sau' }));

    // Select user on page 2
    const userSelect = screen.getByLabelText('Người nhận');
    await user.selectOptions(userSelect, 'u-105');

    // Navigate back to page 1
    await user.click(within(getUserNav()).getByRole('button', { name: 'Trang trước' }));

    // Select capability & scope
    await user.selectOptions(screen.getByLabelText('Quyền'), 'TEACHER_BASE');
    await user.selectOptions(screen.getByLabelText('Phạm vi'), 'PERSONAL');

    // Submit form
    await user.click(screen.getByRole('button', { name: 'Cấp quyền' }));

    await waitFor(() => {
      expect(createdPayload).toEqual(expect.objectContaining({
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
      }));
      expect(screen.getByText('Đã cấp quyền.')).toBeInTheDocument();
    });

    // Verifies the target URL was /api/users/u-105/capability-grants (NOT u-1)
    expect(fetchMock.mock.calls.some(([req, init]) =>
      String(req).includes('/users/u-105/capability-grants') && init?.method === 'POST',
    )).toBe(true);
  });

  it('preserves permission gating and shows limitation notes when capabilities are missing', async () => {
    // Only CAPABILITY_GRANT without USER_MANAGE
    const limitedAuth = auth({ key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(limitedAuth);
      if (url.includes('/capabilities')) {
        return jsonResponse({
          items: [{ key: 'TEACHER_BASE', description: 'GV', allowedScopeTypes: ['PERSONAL'], isSystem: false, isActive: true }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/quyen');

    expect(await screen.findByRole('heading', { name: 'Cấp quyền mới' })).toBeInTheDocument();
    expect(screen.getByText(/chưa thể chọn người nhận quyền/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Người nhận')).toBeDisabled();
    expect(screen.queryByRole('navigation', { name: 'Chuyển trang người dùng' })).not.toBeInTheDocument();
  });

  it('allows selecting subjects beyond page 1 (records 101+) and preserves selected subject across page changes', async () => {
    const page1Subjects = Array.from({ length: 100 }, (_, i) => ({
      id: `s-${i + 1}`,
      code: `MON_${i + 1}`,
      name: `Môn học ${i + 1}`,
      status: 'ACTIVE',
    }));

    const page2Subjects = [
      {
        id: 's-105',
        code: 'TOAN10',
        name: 'Môn Toán 10',
        status: 'ACTIVE',
      },
    ];

    const definitions = {
      items: [
        {
          key: 'REPORTING_STATEMENT_READ',
          description: 'Xem báo cáo kê khai',
          allowedScopeTypes: ['SUBJECT', 'SCHOOL_WIDE'],
          isSystem: false,
          isActive: true,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(fullAdminAuth);
      if (url.includes('/capabilities')) return jsonResponse(definitions);
      if (url.includes('/users') && !url.includes('capability-grants')) {
        return jsonResponse({
          items: [{ id: 'u-1', username: 'gv01', status: 'ACTIVE', profile: { displayName: 'Giáo viên 1' } }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (url.includes('/subjects')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Subjects, page: 1, pageSize: 100, total: 105 });
        if (page === 2) return jsonResponse({ items: page2Subjects, page: 2, pageSize: 100, total: 105 });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    await user.selectOptions(await screen.findByLabelText('Người nhận'), 'u-1');
    await user.selectOptions(screen.getByLabelText('Quyền'), 'REPORTING_STATEMENT_READ');
    await user.selectOptions(screen.getByLabelText('Phạm vi'), 'SUBJECT');

    // Subject pagination is rendered
    expect(await screen.findByRole('navigation', { name: 'Chuyển trang danh mục học phần' })).toHaveTextContent(/105 môn/);

    const subjectNextBtn = () => within(screen.getByRole('navigation', { name: 'Chuyển trang danh mục học phần' })).getByRole('button', { name: 'Trang sau' });
    const subjectPrevBtn = () => within(screen.getByRole('navigation', { name: 'Chuyển trang danh mục học phần' })).getByRole('button', { name: 'Trang trước' });

    // Navigate to page 2 (records 101+)
    await user.click(subjectNextBtn());
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Chuyển trang danh mục học phần' })).toHaveTextContent(/Trang 2 \/ 2/);
    });

    const resourceSelect = screen.getByLabelText('Môn học');
    expect(within(resourceSelect).getByRole('option', { name: /TOAN10 — Môn Toán 10/i })).toBeInTheDocument();

    // Select subject on page 2
    await user.selectOptions(resourceSelect, 's-105');
    expect(resourceSelect).toHaveValue('s-105');

    // Navigate back to page 1
    await user.click(subjectPrevBtn());
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Chuyển trang danh mục học phần' })).toHaveTextContent(/Trang 1 \/ 2/);
    });

    // Selection is preserved!
    expect(resourceSelect).toHaveValue('s-105');
    expect(within(resourceSelect).getByRole('option', { name: /TOAN10 — Môn Toán 10/i })).toBeInTheDocument();
  });

  it('displays error recovery on user page 2 failure and allows successful retry without losing state', async () => {
    let page2Attempts = 0;
    const page1Users = Array.from({ length: 100 }, (_, i) => ({
      id: `u-${i + 1}`,
      username: `gv${i + 1}`,
      status: 'ACTIVE',
      profile: { displayName: `Giáo viên ${i + 1}` },
    }));
    const page2Users = [
      {
        id: 'u-105',
        username: 'gv105',
        status: 'ACTIVE',
        profile: { displayName: 'Thầy Một Lẻ Năm' },
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(fullAdminAuth);
      if (url.includes('/capabilities')) {
        return jsonResponse({
          items: [{ key: 'TEACHER_BASE', description: 'GV', allowedScopeTypes: ['PERSONAL'], isSystem: false, isActive: true }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (url.includes('/users') && !url.includes('capability-grants')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Users, page: 1, pageSize: 100, total: 105 });
        if (page === 2) {
          page2Attempts++;
          if (page2Attempts === 1) {
            // First attempt fails with 500
            return new Response(JSON.stringify({ message: 'Internal Server Error' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          // Second attempt succeeds
          return jsonResponse({ items: page2Users, page: 2, pageSize: 100, total: 105 });
        }
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    // Wait for initial load
    expect(await screen.findByRole('heading', { name: 'Cấp quyền mới' })).toBeInTheDocument();
    const userNav = () => screen.getByRole('navigation', { name: 'Chuyển trang người dùng' });
    expect(userNav()).toHaveTextContent(/105 người dùng/);

    // Navigate to page 2 (which fails on first attempt)
    await user.click(within(userNav()).getByRole('button', { name: 'Trang sau' }));

    // Error recovery is shown (QueryFailure)
    expect(await screen.findByText('Chưa tải được dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('Không thể tải dữ liệu. Dữ liệu hiện có chưa bị thay đổi.')).toBeInTheDocument();

    // FieldPagination remains visible on page 2 and is not hidden
    expect(userNav()).toHaveTextContent(/Trang 2 \/ 2/);

    // Crucially: page 1 data is NOT rendered as page 2 data
    const userSelect = screen.getByLabelText('Người nhận');
    expect(within(userSelect).queryByText(/Giáo viên 1 — gv1/i)).not.toBeInTheDocument();

    // Retry button is available and works
    const retryBtn = screen.getByRole('button', { name: 'Thử lại' });
    await user.click(retryBtn);

    // After retry succeeds, error alert disappears and page 2 user is present
    await waitFor(() => {
      expect(screen.queryByText('Chưa tải được dữ liệu')).not.toBeInTheDocument();
    });
    expect(within(userSelect).getByRole('option', { name: /Thầy Một Lẻ Năm — gv105/i })).toBeInTheDocument();

    // Select user from page 2
    await user.selectOptions(userSelect, 'u-105');
    expect(userSelect).toHaveValue('u-105');
  });

  it('retains selected resource when resource page fails and provides recovery back to page 1', async () => {
    const page1Groups = Array.from({ length: 100 }, (_, i) => ({
      id: `g-${i + 1}`,
      code: `TO_${i + 1}`,
      name: `Tổ chuyên môn ${i + 1}`,
      status: 'ACTIVE',
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(fullAdminAuth);
      if (url.includes('/capabilities')) {
        return jsonResponse({
          items: [{ key: 'SUBJECT_GROUP_LEAD', description: 'Tổ trưởng', allowedScopeTypes: ['SUBJECT_GROUP'], isSystem: false, isActive: true }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (url.includes('/users') && !url.includes('capability-grants')) {
        return jsonResponse({
          items: [{ id: 'u-1', username: 'gv01', status: 'ACTIVE', profile: { displayName: 'Giáo viên 1' } }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (url.includes('/subject-groups')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Groups, page: 1, pageSize: 100, total: 105 });
        if (page === 2) {
          // Page 2 fails
          return new Response(JSON.stringify({ message: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    await user.selectOptions(await screen.findByLabelText('Người nhận'), 'u-1');
    await user.selectOptions(screen.getByLabelText('Quyền'), 'SUBJECT_GROUP_LEAD');
    await user.selectOptions(screen.getByLabelText('Phạm vi'), 'SUBJECT_GROUP');

    const resourceSelect = await screen.findByLabelText('Tổ chuyên môn');
    // Select group 1 from page 1
    await user.selectOptions(resourceSelect, 'g-1');
    expect(resourceSelect).toHaveValue('g-1');

    const groupNav = () => screen.getByRole('navigation', { name: 'Chuyển trang tổ bộ môn' });
    expect(groupNav()).toHaveTextContent(/105 tổ/);

    // Navigate to page 2 (which fails)
    await user.click(within(groupNav()).getByRole('button', { name: 'Trang sau' }));

    // Error recovery is displayed
    expect(await screen.findByText('Chưa tải được dữ liệu')).toBeInTheDocument();

    // Critical check: selected resource g-1 is preserved and still has value g-1!
    expect(resourceSelect).toHaveValue('g-1');
    expect(within(resourceSelect).getByRole('option', { name: /TO_1 — Tổ chuyên môn 1/i })).toBeInTheDocument();

    // FieldPagination is still present and allows navigating back to page 1
    expect(groupNav()).toHaveTextContent(/Trang 2 \/ 2/);
    const prevBtn = within(groupNav()).getByRole('button', { name: 'Trang trước' });
    expect(prevBtn).not.toBeDisabled();

    // Navigate back to page 1
    await user.click(prevBtn);

    // Error alert disappears, page 1 is restored, and g-1 remains selected
    await waitFor(() => {
      expect(screen.queryByText('Chưa tải được dữ liệu')).not.toBeInTheDocument();
      expect(groupNav()).toHaveTextContent(/Trang 1 \/ 2/);
    });
    expect(resourceSelect).toHaveValue('g-1');
  });

  it('does not get stuck when a user page fails to load and allows returning to previous page without app reload', async () => {
    const page1Users = Array.from({ length: 100 }, (_, i) => ({
      id: `u-${i + 1}`,
      username: `gv${i + 1}`,
      status: 'ACTIVE',
      profile: { displayName: `Giáo viên ${i + 1}` },
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(fullAdminAuth);
      if (url.includes('/capabilities')) {
        return jsonResponse({
          items: [{ key: 'TEACHER_BASE', description: 'GV', allowedScopeTypes: ['PERSONAL'], isSystem: false, isActive: true }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (url.includes('/users') && !url.includes('capability-grants')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Users, page: 1, pageSize: 100, total: 105 });
        if (page === 2) {
          return new Response(JSON.stringify({ message: 'Gateway Timeout' }), {
            status: 504,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    expect(await screen.findByRole('heading', { name: 'Cấp quyền mới' })).toBeInTheDocument();
    const userNav = () => screen.getByRole('navigation', { name: 'Chuyển trang người dùng' });

    // Navigate to page 2 (fails)
    await user.click(within(userNav()).getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Chưa tải được dữ liệu')).toBeInTheDocument();

    // User is NOT stuck: "Trang trước" button is operational
    const prevBtn = within(userNav()).getByRole('button', { name: 'Trang trước' });
    expect(prevBtn).not.toBeDisabled();
    await user.click(prevBtn);

    // Returns to page 1 successfully
    await waitFor(() => {
      expect(screen.queryByText('Chưa tải được dữ liệu')).not.toBeInTheDocument();
      expect(userNav()).toHaveTextContent(/Trang 1 \/ 2/);
    });

    // Can select a user from page 1 and continue working
    const userSelect = screen.getByLabelText('Người nhận');
    await user.selectOptions(userSelect, 'u-1');
    expect(userSelect).toHaveValue('u-1');
  });

  it('automatically clamps current page when total records decrease causing current page to exceed valid range', async () => {
    const page1Users = Array.from({ length: 100 }, (_, i) => ({
      id: `u-${i + 1}`,
      username: `gv${i + 1}`,
      status: 'ACTIVE',
      profile: { displayName: `Giáo viên ${i + 1}` },
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(fullAdminAuth);
      if (url.includes('/capabilities')) {
        return jsonResponse({
          items: [{ key: 'TEACHER_BASE', description: 'GV', allowedScopeTypes: ['PERSONAL'], isSystem: false, isActive: true }],
          page: 1,
          pageSize: 100,
          total: 1,
        });
      }
      if (url.includes('/users') && !url.includes('capability-grants')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        // Page 1 reported total: 105 (2 pages)
        if (page === 1) return jsonResponse({ items: page1Users, page: 1, pageSize: 100, total: 105 });
        // By the time page 2 is fetched, server data decreased to 50 items (1 page)
        if (page === 2) return jsonResponse({ items: [], page: 2, pageSize: 100, total: 50 });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    const userNav = () => screen.getByRole('navigation', { name: 'Chuyển trang người dùng' });
    expect(await screen.findByRole('heading', { name: 'Cấp quyền mới' })).toBeInTheDocument();
    expect(userNav()).toHaveTextContent(/Trang 1 \/ 2/);

    // Move to page 2: server reports total 50 on page 2
    await user.click(within(userNav()).getByRole('button', { name: 'Trang sau' }));

    // Clamping effect detects userPages (1) < userPage (2) and automatically sets userPage to 1
    await waitFor(() => {
      // Pagination nav is removed because pages <= 1
      expect(screen.queryByRole('navigation', { name: 'Chuyển trang người dùng' })).not.toBeInTheDocument();
    });

    // Select dropdown still works and displays page 1 user
    const userSelect = screen.getByLabelText('Người nhận');
    await waitFor(() => {
      expect(within(userSelect).getByRole('option', { name: /Giáo viên 1 — gv1/i })).toBeInTheDocument();
    });
  });
});
