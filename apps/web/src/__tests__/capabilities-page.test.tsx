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
    const page1Users = Array.from({ length: 20 }, (_, i) => ({
      id: `u-${i + 1}`,
      username: `gv${i + 1}`,
      status: 'ACTIVE',
      profile: { displayName: `Giáo viên ${i + 1}` },
    }));

    const page2Users = Array.from({ length: 20 }, (_, i) => ({
      id: `u-${i + 21}`,
      username: `gv${i + 21}`,
      status: 'ACTIVE',
      profile: { displayName: `Giáo viên ${i + 21}` },
    }));

    const page6Users = [
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
      pageSize: 20,
      total: 1,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(fullAdminAuth);
      if (url.includes('/capabilities')) return jsonResponse(definitions);
      if (url.includes('/users') && !url.includes('capability-grants')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Users, page: 1, pageSize: 20, total: 105 });
        if (page === 2) return jsonResponse({ items: page2Users, page: 2, pageSize: 20, total: 105 });
        if (page === 6) return jsonResponse({ items: page6Users, page: 6, pageSize: 20, total: 105 });
        return jsonResponse({ items: [], page, pageSize: 20, total: 105 });
      }
      if (url.includes('/capability-grants')) {
        return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    // Wait for initial load
    expect(await screen.findByRole('heading', { name: 'Cấp quyền mới' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Phân trang người nhận' })).toHaveTextContent(/105 người dùng/);

    // Navigate to page 2
    const nextBtn = () => within(screen.getByRole('navigation', { name: 'Phân trang người nhận' })).getByRole('button', { name: 'Trang sau' });
    const prevBtn = () => within(screen.getByRole('navigation', { name: 'Phân trang người nhận' })).getByRole('button', { name: 'Trang trước' });

    await user.click(nextBtn());
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Phân trang người nhận' })).toHaveTextContent(/Trang 2 \/ 6/);
    });

    // Navigate up to page 6
    await user.click(nextBtn()); // page 3
    await user.click(nextBtn()); // page 4
    await user.click(nextBtn()); // page 5
    await user.click(nextBtn()); // page 6

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Phân trang người nhận' })).toHaveTextContent(/Trang 6 \/ 6/);
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
    await user.click(prevBtn()); // page 5
    await user.click(prevBtn()); // page 4
    await user.click(prevBtn()); // page 3
    await user.click(prevBtn()); // page 2
    await user.click(prevBtn()); // page 1

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Phân trang người nhận' })).toHaveTextContent(/Trang 1 \/ 6/);
    });

    // Crucial check: user selection is NOT lost or reset!
    expect(userSelect).toHaveValue('u-105');
    expect(within(userSelect).getByRole('option', { name: /Thầy Một Lẻ Năm — gv105/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lịch sử quyền của Thầy Một Lẻ Năm' })).toBeInTheDocument();
  });

  it('allows selecting subject groups beyond page 1 and preserves selected group across page changes', async () => {
    const page1Groups = Array.from({ length: 20 }, (_, i) => ({
      id: `g-${i + 1}`,
      code: `TO_${i + 1}`,
      name: `Tổ chuyên môn ${i + 1}`,
      status: 'ACTIVE',
    }));

    const page2Groups = [
      {
        id: 'g-25',
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
      pageSize: 20,
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
          pageSize: 20,
          total: 1,
        });
      }
      if (url.includes('/subject-groups')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Groups, page: 1, pageSize: 20, total: 25 });
        if (page === 2) return jsonResponse({ items: page2Groups, page: 2, pageSize: 20, total: 25 });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    await user.selectOptions(await screen.findByLabelText('Người nhận'), 'u-1');
    await user.selectOptions(screen.getByLabelText('Quyền'), 'SUBJECT_GROUP_LEAD');
    await user.selectOptions(screen.getByLabelText('Phạm vi'), 'SUBJECT_GROUP');

    // Subject group pagination is rendered
    expect(await screen.findByRole('navigation', { name: 'Phân trang tổ chuyên môn' })).toHaveTextContent(/25 tổ/);

    const groupNextBtn = () => within(screen.getByRole('navigation', { name: 'Phân trang tổ chuyên môn' })).getByRole('button', { name: 'Trang sau' });
    const groupPrevBtn = () => within(screen.getByRole('navigation', { name: 'Phân trang tổ chuyên môn' })).getByRole('button', { name: 'Trang trước' });

    // Navigate to page 2
    await user.click(groupNextBtn());
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Phân trang tổ chuyên môn' })).toHaveTextContent(/Trang 2 \/ 2/);
    });

    const resourceSelect = screen.getByLabelText('Tổ chuyên môn');
    expect(within(resourceSelect).getByRole('option', { name: /GDTC — Tổ Giáo dục thể chất/i })).toBeInTheDocument();

    // Select group on page 2
    await user.selectOptions(resourceSelect, 'g-25');
    expect(resourceSelect).toHaveValue('g-25');

    // Navigate back to page 1
    await user.click(groupPrevBtn());
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Phân trang tổ chuyên môn' })).toHaveTextContent(/Trang 1 \/ 2/);
    });

    // Selection is preserved!
    expect(resourceSelect).toHaveValue('g-25');
    expect(within(resourceSelect).getByRole('option', { name: /GDTC — Tổ Giáo dục thể chất/i })).toBeInTheDocument();
  });

  it('paginates active capability definitions table without cutting off records', async () => {
    const page1Defs = Array.from({ length: 20 }, (_, i) => ({
      key: `CAP_${i + 1}`,
      description: `Mô tả quyền ${i + 1}`,
      allowedScopeTypes: ['SCHOOL_WIDE'],
      isSystem: false,
      isActive: true,
    }));

    const page2Defs = [
      {
        key: 'SPECIAL_CAP_25',
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
        if (page === 1) return jsonResponse({ items: page1Defs, page: 1, pageSize: 20, total: 21 });
        if (page === 2) return jsonResponse({ items: page2Defs, page: 2, pageSize: 20, total: 21 });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
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
    expect(defNav()).toHaveTextContent(/21 bản ghi/);

    // Click next page on definitions table pagination
    await user.click(within(defNav()).getByRole('button', { name: 'Trang sau' }));

    // Page 2 renders the 21st definition in the table
    await waitFor(() => {
      expect(within(getTableRegion()).getByText('Quyền đặc biệt trang hai')).toBeInTheDocument();
      expect(within(getTableRegion()).queryByText('Mô tả quyền 1')).not.toBeInTheDocument();
      expect(defNav()).toHaveTextContent(/Trang 2 \/ 2/);
    });
  });

  it('paginates user grant history across pages, displaying active and revoked grants, and supports revoke mutation', async () => {
    const page1Grants = Array.from({ length: 20 }, (_, i) => ({
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
        id: 'grant-21-revoked',
        userId: 'u-1',
        capabilityKey: 'TIMETABLE_MANAGE',
        scopeType: 'SCHOOL_WIDE',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2026-12-31T23:59:59.000Z',
        revokedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'grant-22-active',
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
          pageSize: 20,
          total: 1,
        });
      }
      if (url.includes('/users') && !url.includes('capability-grants')) {
        return jsonResponse({
          items: [{ id: 'u-1', username: 'gv01', status: 'ACTIVE', profile: { displayName: 'Nguyễn Văn Một' } }],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      }
      if (url.includes('/capability-grants/grant-22-active/revoke') && init?.method === 'POST') {
        revokedCalled = true;
        return jsonResponse({ id: 'grant-22-active', revokedAt: '2026-10-11T00:00:00.000Z' });
      }
      if (url.includes('/users/u-1/capability-grants')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') || 1);
        if (page === 1) return jsonResponse({ items: page1Grants, page: 1, pageSize: 20, total: 22 });
        if (page === 2) return jsonResponse({ items: page2Grants, page: 2, pageSize: 20, total: 22 });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    // Select user
    await user.selectOptions(await screen.findByLabelText('Người nhận'), 'u-1');

    // History table appears
    expect(await screen.findByRole('heading', { name: 'Lịch sử quyền của Nguyễn Văn Một' })).toBeInTheDocument();
    const getGrantsNav = () => screen.getByRole('navigation', { name: 'Phân trang lịch sử cấp quyền' });
    expect(getGrantsNav()).toHaveTextContent(/22 bản ghi/);

    // Navigate to page 2 of grants history
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
          pageSize: 20,
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
            pageSize: 20,
            total: 25,
          });
        }
        if (page === 2) {
          return jsonResponse({
            items: [{ id: 'u-25', username: 'gv25', status: 'ACTIVE', profile: { displayName: 'GV 25' } }],
            page: 2,
            pageSize: 20,
            total: 25,
          });
        }
      }
      if (url.includes('/users/u-25/capability-grants') && init?.method === 'POST') {
        createdPayload = JSON.parse(init.body as string);
        return jsonResponse({ id: 'new-grant', userId: 'u-25', capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }, 201);
      }
      return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/quan-tri/quyen');

    // Go to page 2 of users
    const getUserNav = () => screen.getByRole('navigation', { name: 'Phân trang người nhận' });
    await waitFor(() => expect(getUserNav()).toBeInTheDocument());
    await user.click(within(getUserNav()).getByRole('button', { name: 'Trang sau' }));

    // Select user on page 2
    const userSelect = screen.getByLabelText('Người nhận');
    await user.selectOptions(userSelect, 'u-25');

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

    // Verifies the target URL was /api/users/u-25/capability-grants (NOT u-1)
    expect(fetchMock.mock.calls.some(([req, init]) =>
      String(req).includes('/users/u-25/capability-grants') && init?.method === 'POST',
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
          pageSize: 20,
          total: 1,
        });
      }
      return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/quyen');

    expect(await screen.findByRole('heading', { name: 'Cấp quyền mới' })).toBeInTheDocument();
    expect(screen.getByText(/chưa thể chọn người nhận quyền/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Người nhận')).toBeDisabled();
    expect(screen.queryByRole('navigation', { name: 'Phân trang người nhận' })).not.toBeInTheDocument();
  });
});
