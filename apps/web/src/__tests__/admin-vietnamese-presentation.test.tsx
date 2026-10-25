import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemStatusPage } from '../pages/SystemStatusPage';
import { ApiError } from '../lib/api-client';
import * as api from '../lib/api-client';
import { BusinessConfigurationPage } from '../pages/BusinessConfigurationPage';
import type { BusinessPolicyUiAdapter } from '../lib/business-policy-ui-registry';
import { jsonResponse, normalAuth, renderApp, renderWithQuery } from './test-utils';

const paged = (items: unknown[] = []) => ({ items, total: items.length, page: 1, pageSize: 20 });
const target = { id: 'target', username: 'teacher-test', status: 'ACTIVE', profile: { displayName: 'Giáo viên kiểm thử', isTeachingStaff: true } };
const grants = ['USER_MANAGE', 'CAPABILITY_GRANT', 'AUDIT_VIEW', 'BUSINESS_CONFIGURATION_MANAGE'];
const secret = 'SQL_INTERNAL secret-host token=PRIVATE request-private';
const routes = ['/quan-tri/nguoi-dung', '/quan-tri/quyen', '/quan-tri/nhat-ky', '/quan-tri/chinh-sach-nghiep-vu'];
const adapter: BusinessPolicyUiAdapter = {
  familyKey: 'TEST', resourceKind: 'SCHOOL_WIDE', validatorVersion: 'v1', displayName: 'Chính sách kiểm thử', description: 'Kiểm thử',
  initialPayload: () => ({}), validatePayload: () => ({ valid: true, payload: {} }),
  EditorComponent: () => <p>Nội dung kiểm thử</p>, SummaryComponent: () => <p>Nội dung đã lưu</p>,
};
const policyFamily = { key: 'TEST', resourceKind: 'SCHOOL_WIDE', currentValidatorVersion: 'v1', publicationEnabled: true };
function mockFetch(responder: (url: string, init?: RequestInit) => Response | Promise<Response>, privileges = grants) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return jsonResponse({ ...normalAuth, capabilities: privileges.map((key) => ({ key, scope: 'SCHOOL_WIDE' })) });
    return responder(url, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
function expectPrivateDetailsAbsent() {
  // textContent also inspects closed details, not just visible text.
  expect(document.body.textContent).not.toMatch(/SQL_INTERNAL|secret-host|PRIVATE|request-private/);
}

describe('P5-058 admin Vietnamese presentation', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  for (const route of routes) for (const status of [401, 403, 409, 500]) {
    it(`${route}: HTTP ${status} remains distinct from empty data and hides all error internals`, async () => {
      mockFetch(() => jsonResponse({ message: secret, error: secret, requestId: 'request-private' }, status));
      renderApp(route);
      if (status === 401) expect(await screen.findByRole('heading', { name: 'Đăng nhập' }, { timeout: 5000 })).toBeInTheDocument();
      if (status === 403) expect((await screen.findAllByText('Tài khoản chưa được cấp quyền thực hiện thao tác này.')).length).toBeGreaterThan(0);
      if (status === 409) expect((await screen.findAllByRole('button', { name: 'Tải lại dữ liệu' })).length).toBeGreaterThan(0);
      if (status === 500) expect((await screen.findAllByRole('button', { name: 'Thử lại' })).length).toBeGreaterThan(0);
      expect(screen.queryByText('Chưa có tài khoản người dùng.')).not.toBeInTheDocument();
      expectPrivateDetailsAbsent();
    });
  }

  for (const status of [401, 403, 409, 500]) it(`public health HTTP ${status} is safe and never claims readiness`, async () => {
    vi.spyOn(api, 'fetchHealthLive').mockRejectedValue(new ApiError(status, secret, 'request-private', secret));
    vi.spyOn(api, 'fetchHealthReady').mockRejectedValue(new ApiError(status, secret));
    renderWithQuery(<SystemStatusPage />);
    expect(await screen.findByText('Chưa lấy được trạng thái mới nhất')).toBeInTheDocument();
    expect(screen.queryByText('Hệ thống hoạt động bình thường')).not.toBeInTheDocument();
    expectPrivateDetailsAbsent();
    if (status === 401) expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toBeInTheDocument();
    if (status === 403) expect(screen.getByRole('link', { name: 'Về trang công việc' })).toBeInTheDocument();
    if (status === 409) expect(screen.getByRole('button', { name: 'Tải lại dữ liệu' })).toBeInTheDocument();
  });

  for (const status of [401, 403, 409, 500]) it(`template preview HTTP ${status} cannot grant or leak error data`, async () => {
    const calls = mockFetch((url, init) => {
      if (init?.method === 'POST') return jsonResponse({ message: secret, requestId: 'request-private' }, status);
      if (url.includes('responsibility-templates')) return jsonResponse({ items: [{ key: 'TEACHER', name: 'Giáo viên', version: 'v1', description: 'Mẫu giáo viên', requiredResourceKind: 'NONE', requiresTeachingStaff: true }] });
      return jsonResponse(paged([target]));
    });
    renderApp(routes[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Chọn teacher-test' }));
    fireEvent.click(await screen.findByRole('button', { name: /Kiểm tra quyền trước khi áp dụng/ }));
    if (status === 401) await screen.findByRole('heading', { name: 'Đăng nhập' }, { timeout: 5000 });
    else await screen.findByText('Chưa hoàn tất kiểm tra hoặc áp dụng quyền');
    expectPrivateDetailsAbsent();
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu phân quyền/ })).not.toBeInTheDocument();
    expect(calls.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  for (const status of [401, 403, 409, 500]) it(`policy mutation HTTP ${status} retains form without automatically resending`, async () => {
    const calls = mockFetch((url, init) => {
      if (init?.method === 'POST') return jsonResponse({ message: secret, error: secret }, status);
      return jsonResponse(url.includes('/families') ? [policyFamily] : paged());
    });
    renderWithQuery(<BusinessConfigurationPage adapters={[adapter]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo bản nháp' }));
    fireEvent.change(screen.getByLabelText(/Ngày bắt đầu hiệu lực/), { target: { value: '2026-10-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    await screen.findByText('Chưa hoàn tất thao tác chính sách');
    expect(screen.getByLabelText(/Ngày bắt đầu hiệu lực/)).toHaveValue('2026-10-24');
    expect(screen.queryByText('Đã tạo bản nháp chính sách nghiệp vụ mới.')).not.toBeInTheDocument();
    expectPrivateDetailsAbsent();
    expect(calls.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  for (const [outcome, label] of [
    ['RESOLVED', 'Đã tìm thấy chính sách có hiệu lực'], ['POLICY_NOT_CONFIGURED', 'Chưa cấu hình chính sách'],
    ['POLICY_AMBIGUOUS', 'Có nhiều chính sách trùng hiệu lực'], ['POLICY_CORRUPT', 'Dữ liệu chính sách không toàn vẹn'],
    ['UNKNOWN_POLICY_FAMILY', 'Không tìm thấy nhóm chính sách'], ['INVALID_POLICY_RESOURCE', 'Phạm vi chính sách không hợp lệ'],
    ['INVALID_EFFECTIVE_DATE', 'Ngày tra cứu không hợp lệ'], ['constructor', 'Chưa xác định được kết quả'],
  ]) it(`policy resolution ${outcome} has a factual Vietnamese label`, async () => {
    mockFetch((url) => jsonResponse(url.includes('/families') ? [policyFamily] : url.includes('/resolve')
      ? { outcome, family: 'TEST', resource: { kind: 'SCHOOL_WIDE' }, validatorVersion: 'v1', payload: {}, effectiveFrom: '2026-10-24' }
      : paged()));
    renderWithQuery(<BusinessConfigurationPage adapters={[adapter]} />);
    await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' });
    fireEvent.change(document.getElementById('resolve-family')!, { target: { value: 'TEST' } });
    fireEvent.change(screen.getByLabelText('Ngày cần tra cứu'), { target: { value: '2026-10-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));
    expect(await screen.findByRole('heading', { name: new RegExp(`Kết quả tra cứu: ${label}`) })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(outcome);
  });

  it('keeps future, expired and revoked grants distinct without using inaccessible resource UUID as a name', async () => {
    mockFetch((url) => {
      if (url.includes('/api/capabilities')) return jsonResponse(paged([]));
      if (url.includes('/capability-grants')) return jsonResponse(paged([
        { id: 'future', capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validFrom: '2999-01-01T00:00:00Z' },
        { id: 'past', capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validUntil: '2000-01-01T00:00:00Z' },
        { id: 'revoked', capabilityKey: 'TEACHER_BASE', scopeType: 'SUBJECT', scopeResourceId: 'private-scope-uuid', revokedAt: '2026-01-01T00:00:00Z' },
      ]));
      return jsonResponse(paged([target]));
    });
    renderApp(routes[1]);
    fireEvent.change(await screen.findByLabelText('Người nhận'), { target: { value: target.id } });
    expect(await screen.findByText('Chưa đến thời điểm hiệu lực')).toBeInTheDocument();
    expect(screen.getByText('Hết hiệu lực')).toBeInTheDocument();
    expect(screen.getByText('Đã thu hồi')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('private-scope-uuid');
    expect(screen.getAllByRole('button', { name: 'Thu hồi' })).toHaveLength(2);
  });

  it('does not claim success when a successful HTTP response says the template was not applied', async () => {
    mockFetch((url, init) => {
      if (url.endsWith('/apply') && init?.method === 'POST') return jsonResponse({ applied: false, templateKey: 'TEACHER', version: 'v1', grantsAdded: [], alreadyPresent: [] });
      if (url.endsWith('/preview') && init?.method === 'POST') return jsonResponse({ templateKey: 'TEACHER', version: 'v1', eligibility: { isEligible: true }, requiredResources: { provided: true }, grantsToAdd: [], alreadyPresent: [], conflicts: [], notes: [] });
      if (url.includes('responsibility-templates')) return jsonResponse({ items: [{ key: 'TEACHER', name: 'Giáo viên', version: 'v1', description: 'Mẫu giáo viên', requiredResourceKind: 'NONE', requiresTeachingStaff: true }] });
      return jsonResponse(paged([target]));
    });
    renderApp(routes[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Chọn teacher-test' }));
    fireEvent.click(await screen.findByRole('button', { name: /Kiểm tra quyền trước khi áp dụng/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Áp dụng Mẫu phân quyền/ }));
    expect(await screen.findByText(/Chưa áp dụng mẫu. Hãy kiểm tra quyền trước khi thử lại/)).toBeInTheDocument();
    expect(screen.queryByText(/Đã áp dụng thành công/)).not.toBeInTheDocument();
  });

  it('does not report zero users while loading or grant sensitive operations by job title', async () => {
    let release!: (response: Response) => void;
    mockFetch(() => new Promise<Response>((resolve) => { release = resolve; }), ['USER_MANAGE']);
    renderApp(routes[0]);
    await screen.findByRole('status', { name: 'Đang tải dữ liệu' });
    expect(screen.getAllByText('Chưa xác định').length).toBeGreaterThanOrEqual(4);
    release(jsonResponse(paged([{ ...target, profile: { ...target.profile, positionTitle: 'Hiệu trưởng' } }])));
    fireEvent.click(await screen.findByRole('button', { name: 'Chọn teacher-test' }));
    expect(screen.queryByRole('button', { name: /Đặt lại mật khẩu/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tài khoản an toàn' }));
    // Preflight remains pending; no confirmation or delete action can be inferred from the title.
    expect(screen.queryByRole('button', { name: /Xác nhận xóa vĩnh viễn/ })).not.toBeInTheDocument();
  });

  it('keeps audit filters and evidence intact while translating results and known actions', async () => {
    const calls = mockFetch(() => jsonResponse(paged([
      { id: 'a', action: 'CAPABILITY_GRANTED', entityType: 'CapabilityGrant', entityId: 'grant-id', actorUserId: 'actor-id', requestId: 'trace-id', result: 'SUCCESS', createdAt: '2026-01-01T00:00:00Z', metadata: { capabilityKey: 'TEACHER_BASE' } },
      { id: 'b', action: 'FUTURE_ACTION', entityType: 'User', result: 'UNKNOWN', createdAt: '2026-01-01T00:00:00Z' },
    ])));
    renderApp(routes[2]);
    expect(await screen.findByText('Chưa xác định kết quả')).toBeInTheDocument();
    const row = screen.getByText('CAPABILITY_GRANTED').closest('tr')!;
    expect(within(row).getByText('Thành công')).toBeInTheDocument();
    expect(within(row).getByText('Cấp quyền')).toBeInTheDocument();
    fireEvent.click(within(row).getByText('Thông tin bổ sung của sự kiện'));
    expect(within(row).getByText(/TEACHER_BASE/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hành động'), { target: { value: 'CAPABILITY_GRANTED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng bộ lọc' }));
    await waitFor(() => expect(calls).toHaveBeenCalledWith(expect.stringContaining('action=CAPABILITY_GRANTED'), expect.anything()));
  });
});
