import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const page = (items: unknown[] = []) => ({ items, page: 1, pageSize: 20, total: items.length });
const auth = (...capabilities: Array<{ key: string; scope: string; resourceId?: string }>) => ({ ...normalAuth, capabilities });

describe('Phase 01 management pages', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('creates a user from the long staff-register form and preserves the actual DTO shape', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(auth({ key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' }));
      if (url.includes('/api/users') && init?.method === 'POST') return jsonResponse({ id: 'new-user', username: 'gv01', status: 'PENDING', profile: null });
      if (url.includes('/api/users')) return jsonResponse(page());
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderApp('/quan-tri/nguoi-dung');
    await user.click(await screen.findByRole('button', { name: /tạo người dùng/i }));
    await user.type(screen.getByLabelText('Tên đăng nhập'), 'gv01'); await user.type(screen.getByLabelText('Mật khẩu khởi tạo'), 'Secure-Paste-123'); await user.type(screen.getByLabelText('Mã nhân sự'), 'GV01'); await user.type(screen.getByLabelText('Tên hiển thị'), 'Nguyễn Văn Bình');
    const createButtons = screen.getAllByRole('button', { name: 'Tạo người dùng' });
    await user.click(createButtons[createButtons.length - 1]!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"displayName":"Nguyễn Văn Bình"') })));
    expect(await screen.findByText(/mật khẩu khởi tạo không được hiển thị lại/i)).toBeInTheDocument();
  });

  it('creates a compact subject-group catalog entry', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); if (url.endsWith('/auth/me')) return jsonResponse(auth({ key: 'SUBJECT_GROUP_MANAGE', scope: 'SCHOOL_WIDE' })); if (url.includes('/subject-groups') && init?.method === 'POST') return jsonResponse({ id: 'g1', code: 'TOAN', name: 'Tổ Toán', status: 'ACTIVE' }); if (url.includes('/subject-groups')) return jsonResponse(page()); return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderApp('/quan-tri/to-chuyen-mon');
    await user.click(await screen.findByRole('button', { name: /thêm tổ/i })); await user.type(screen.getByLabelText('Mã'), 'TOAN'); await user.type(screen.getByLabelText('Tên'), 'Tổ Toán'); await user.click(screen.getByRole('button', { name: /thêm vào danh mục/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/subject-groups', expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: 'TOAN', name: 'Tổ Toán' }) })));
  });

  it('keeps assignment history visible but disables creation without user lookup', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => { const url = String(input); if (url.endsWith('/auth/me')) return jsonResponse(auth({ key: 'SUBJECT_GROUP_MANAGE', scope: 'SCHOOL_WIDE' })); if (url.includes('/subject-group-memberships')) return jsonResponse(page()); if (url.includes('/subject-groups')) return jsonResponse(page()); return jsonResponse({}); });
    vi.stubGlobal('fetch', fetchMock); renderApp('/quan-tri/phan-cong-to');
    expect(await screen.findByText(/không có quyền đọc danh sách người dùng/i)).toBeInTheDocument(); expect(screen.getByRole('button', { name: /tạo phân công/i })).toBeDisabled();
  });

  it('marks ACTIVITY scope unavailable instead of showing a raw resource field', async () => {
    const definitions = page([{ key: 'GDDDP_COORDINATOR', description: 'Điều phối', allowedScopeTypes: ['ACTIVITY'], isSystem: false, isActive: true }]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => { const url = String(input); if (url.endsWith('/auth/me')) return jsonResponse(auth({ key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' }, { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' })); if (url.includes('/capabilities')) return jsonResponse(definitions); if (url.includes('/users')) return jsonResponse(page([{ id: 'u1', username: 'gv01', status: 'ACTIVE', profile: { displayName: 'Nguyễn Bình' } }])); return jsonResponse(page()); });
    vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderApp('/quan-tri/quyen');
    await user.selectOptions(await screen.findByLabelText('Người nhận'), 'u1'); await user.selectOptions(screen.getByLabelText('Quyền'), 'GDDDP_COORDINATOR'); await user.selectOptions(screen.getByLabelText('Phạm vi'), 'ACTIVITY');
    expect(screen.getByText(/chưa có danh mục hoạt động/i)).toBeInTheDocument(); expect(screen.queryByLabelText(/mã tài nguyên/i)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Cấp quyền' })).toBeDisabled();
  });

  it('renders audit as chronology and removes secret-shaped metadata keys', async () => {
    const events = page([{ id: 'e1', action: 'USER_UPDATED', entityType: 'User', result: 'SUCCESS', createdAt: '2026-08-09T08:00:00.000Z', metadata: { changed: 'displayName', password: 'must-not-render', nested: { token: 'hidden', safe: true } } }]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me') ? jsonResponse(auth({ key: 'AUDIT_VIEW', scope: 'SCHOOL_WIDE' })) : jsonResponse(events)); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderApp('/quan-tri/nhat-ky');
    await user.click(await screen.findByText(/xem metadata an toàn/i)); expect(screen.getByText(/"changed": "displayName"/i)).toBeInTheDocument(); expect(screen.queryByText(/must-not-render/i)).not.toBeInTheDocument(); expect(screen.queryByText(/"token"/i)).not.toBeInTheDocument();
  });

  it('shows subject-group duty history but blocks raw staff lookup workflow', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => { const url = String(input); if (url.endsWith('/auth/me')) return jsonResponse(auth({ key: 'SUBJECT_GROUP_LEAD', scope: 'SUBJECT_GROUP', resourceId: 'group-1' })); return jsonResponse(page()); }); vi.stubGlobal('fetch', fetchMock); renderApp('/quan-tri/kiem-nhiem/phan-cong');
    expect(await screen.findByText(/cần quyền tra cứu nhân sự/i)).toBeInTheDocument(); expect(screen.getByRole('button', { name: /tạo phân công/i })).toBeDisabled();
  });
});
