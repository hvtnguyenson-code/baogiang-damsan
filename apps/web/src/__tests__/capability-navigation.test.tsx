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
  });

  it('shows duty assignment for an effective exact subject-group grant', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith('SUBJECT_GROUP_LEAD', 'SUBJECT_GROUP', 'group-1'))));
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: 'Phân công kiêm nhiệm' })).length).toBeGreaterThanOrEqual(1);
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
});
