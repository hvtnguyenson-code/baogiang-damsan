import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const page = (items: unknown[] = []) => ({ items, page: 1, pageSize: 20, total: items.length });
const auth = (...capabilities: Array<{ key: string; scope: string; resourceId?: string }>) => ({
  ...normalAuth,
  capabilities,
});

describe('P5-051 Slice C: Users Administration Workspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockUsers = [
    {
      id: 'u-teacher-1',
      username: 'gv_nguyenvanb',
      status: 'ACTIVE',
      profile: {
        staffCode: 'GV001',
        displayName: 'Nguyễn Văn Bình',
        positionTitle: 'Giáo viên Toán',
        isTeachingStaff: true,
        email: 'binh@damsan.edu.vn',
        phone: '0901234567',
      },
    },
    {
      id: 'u-clean-2',
      username: 'gv_clean_slate',
      status: 'ACTIVE',
      profile: {
        staffCode: 'GV002',
        displayName: 'Trần Thị Thu',
        positionTitle: 'Giáo viên Văn',
        isTeachingStaff: true,
      },
    },
    {
      id: 'u-blocked-3',
      username: 'gv_has_history',
      status: 'ACTIVE',
      profile: {
        staffCode: 'GV003',
        displayName: 'Lê Hoàng Nam',
        positionTitle: 'Tổ trưởng Tự nhiên',
        isTeachingStaff: true,
      },
    },
  ];

  it('renders split workspace, allows user selection and tab switching', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse(
          auth(
            { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
          ),
        );
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    expect(await screen.findByText('Nguyễn Văn Bình')).toBeInTheDocument();
    expect(screen.getByText('Trần Thị Thu')).toBeInTheDocument();

    // Initially shows empty right pane
    expect(screen.getByText('Chưa chọn người dùng')).toBeInTheDocument();

    // Click on Nguyễn Văn Bình
    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    // Selected user workspace header is rendered
    expect(await screen.findByText('@gv_nguyenvanb')).toBeInTheDocument();
    expect(screen.getByText('Nhân sự giảng dạy')).toBeInTheDocument();

    // Verify tabs exist
    expect(screen.getByRole('button', { name: /Mẫu trách nhiệm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hồ sơ & Trạng thái/i })).toBeInTheDocument();

    // Switch to Profile tab
    await user.click(screen.getByRole('button', { name: /Hồ sơ & Trạng thái/i }));
    expect(screen.getAllByText('Giáo viên Toán').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('binh@damsan.edu.vn')).toBeInTheDocument();
  });

  it('runs responsibility template preview and apply flow for TEACHER template', async () => {
    let previewCalled = false;
    let applyCalled = false;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse(
          auth(
            { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
          ),
        );
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview') && init?.method === 'POST') {
        previewCalled = true;
        return jsonResponse({
          templateKey: 'TEACHER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'NONE', provided: true },
          grantsToAdd: [
            { capabilityKey: 'TEACHER_BASE', scopeType: 'SCHOOL_WIDE', description: 'Quyền cơ sở giáo viên' },
            { capabilityKey: 'TIMETABLE_VIEW', scopeType: 'SCHOOL_WIDE', description: 'Xem thời khóa biểu' },
          ],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: ['Mẫu chuẩn chuyên môn áp dụng cho tất cả giáo viên.'],
        });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/apply') && init?.method === 'POST') {
        applyCalled = true;
        return jsonResponse({
          templateKey: 'TEACHER',
          version: '1.0.0',
          grantsAdded: [
            { id: 'g-1', capabilityKey: 'TEACHER_BASE', scopeType: 'SCHOOL_WIDE' },
            { id: 'g-2', capabilityKey: 'TIMETABLE_VIEW', scopeType: 'SCHOOL_WIDE' },
          ],
          alreadyPresent: [],
        });
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    // Default tab is templates
    expect(screen.getByLabelText(/Chọn Mẫu trách nhiệm/i)).toBeInTheDocument();

    // Click Preview button
    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn);

    await waitFor(() => expect(previewCalled).toBe(true));

    // Verify preview delta rendered
    expect(await screen.findByText('Đủ điều kiện')).toBeInTheDocument();
    expect(screen.getByText('Quyền cơ sở giáo viên')).toBeInTheDocument();
    expect(screen.getByText('Mẫu chuẩn chuyên môn áp dụng cho tất cả giáo viên.')).toBeInTheDocument();

    // Apply button is now enabled
    const applyBtn = screen.getByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i });
    expect(applyBtn).not.toBeDisabled();

    // Click Apply
    await user.click(applyBtn);
    await waitFor(() => expect(applyCalled).toBe(true));

    // Result feedback is shown
    expect(await screen.findByText(/Đã áp dụng thành công/i)).toBeInTheDocument();
  });

  it('renders Subject Leader catalog selectors with required subjectGroupId and explicit subjectIds label', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse(
          auth(
            { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
          ),
        );
      }
      if (url.includes('/api/subject-groups')) {
        return jsonResponse(
          page([
            { id: 'sg-math', code: 'TOAN_TIN', name: 'Tổ Toán - Tin', status: 'ACTIVE' },
          ]),
        );
      }
      if (url.includes('/api/subjects')) {
        return jsonResponse(
          page([
            { id: 's-math', code: 'TOAN', name: 'Môn Toán', status: 'ACTIVE' },
            { id: 's-cs', code: 'TIN', name: 'Môn Tin học', status: 'ACTIVE' },
          ]),
        );
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    // Select SUBJECT_LEADER
    const templateSelect = screen.getByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'SUBJECT_LEADER');

    // Verify required subjectGroupId selector and exact label for subjectIds
    expect(await screen.findByLabelText(/Tổ chuyên môn phụ trách/i)).toBeInTheDocument();
    expect(
      screen.getByText('Môn chuyên môn được giao cho tổ trưởng (Tùy chọn):'),
    ).toBeInTheDocument();
    expect(screen.getByText('Môn Toán (TOAN)')).toBeInTheDocument();
    expect(screen.getByText('Môn Tin học (TIN)')).toBeInTheDocument();
  });

  it('disables apply and displays safe guard when coordinator lookup is inaccessible', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse(
          auth(
            { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
          ),
        );
      }
      if (url.includes('/programme-planning/masters')) {
        // Backend returns 403 or empty array when user lacks coordinator master lookup
        return jsonResponse([], 403);
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    // Select GDDP_COORDINATOR
    const templateSelect = screen.getByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    // Warning is rendered and preview button is disabled
    expect(
      await screen.findByText(/Chưa có danh mục chương trình khả dụng/i),
    ).toBeInTheDocument();
    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    expect(previewBtn).toBeDisabled();
  });

  it('displays Baseline Reconciliation statistics and sends only missing user IDs on apply', async () => {
    let applyPayload: { targetUserIds: string[] } | null = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse(
          auth(
            { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
          ),
        );
      }
      if (url.includes('/api/baseline-reconciliation/preview')) {
        return jsonResponse({
          totalActiveUsers: 45,
          eligibleProfessionals: 38,
          alreadyCompliant: 35,
          missing: [
            { userId: 'u-missing-1', username: 'gv_missing_1', displayName: 'Giáo viên Thiếu', status: 'ACTIVE' },
          ],
          conflicts: [],
          excluded: [],
        });
      }
      if (url.includes('/api/baseline-reconciliation/apply') && init?.method === 'POST') {
        applyPayload = JSON.parse(String(init.body));
        return jsonResponse({
          processedCount: 1,
          grantsCreated: 1,
          skippedAlreadyCompliant: 0,
          skippedConflict: 0,
          skippedExcluded: 0,
          results: [{ userId: 'u-missing-1', status: 'SUCCESS', grantsCreated: 1 }],
        });
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    // Click reconciliation toggle button
    const toggleBtn = await screen.findByRole('button', { name: /Đối soát chuẩn chuyên môn/i });
    await user.click(toggleBtn);

    // Preview stats are rendered
    expect(await screen.findByText('Tổng hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Đủ điều kiện GV')).toBeInTheDocument();
    expect(screen.getByText('gv_missing_1')).toBeInTheDocument();

    // Click apply
    const applyBtn = screen.getByRole('button', { name: /Áp dụng chuẩn cho/i });
    expect(applyBtn).not.toBeDisabled();
    await user.click(applyBtn);

    await waitFor(() => expect(applyPayload).not.toBeNull());
    // CRITICAL: Must contain missing IDs and NEVER empty array
    expect((applyPayload as { targetUserIds: string[] } | null)?.targetUserIds).toEqual(['u-missing-1']);

    // Post-apply stats are shown
    expect(await screen.findByText(/Kết quả đối soát vừa thực hiện/i)).toBeInTheDocument();
    expect(screen.getByText(/Số tài khoản đã xử lý: 1/)).toBeInTheDocument();
  });

  it('safe delete UX: renders BLOCKED state with blocker reasons, cleanup counts and no delete button', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse(
          auth(
            { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'SYSTEM_ADMIN', scope: 'SCHOOL_WIDE' },
          ),
        );
      }
      if (url.includes('/api/users/u-blocked-3/delete-preflight')) {
        return jsonResponse({
          targetUserId: 'u-blocked-3',
          username: 'gv_has_history',
          displayName: 'Lê Hoàng Nam',
          eligibility: 'BLOCKED',
          blockers: [
            { code: 'LOGIN_HISTORY', reason: 'Tài khoản đã có lịch sử đăng nhập thực tế (hasAuditLogs: true).' },
            { code: 'BUSINESS_HISTORY', reason: 'Tài khoản đang có 2 phân công giảng dạy trong năm học.' },
          ],
          cleanupCounts: { staffProfiles: 1, subjectGroupMemberships: 1, staffSubjects: 2 },
          disableRecommended: true,
        });
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_has_history' }));

    // Switch to Safe Delete tab
    const deleteTab = screen.getByRole('button', { name: /Xóa tài khoản an toàn/i });
    await user.click(deleteTab);

    // Verify BLOCKED banner and reasons
    expect(await screen.findByText(/TÀI KHOẢN KHÔNG ĐỦ ĐIỀU KIỆN XÓA VẬT LÝ/i)).toBeInTheDocument();
    expect(screen.getByText(/Tài khoản đã có lịch sử đăng nhập/i)).toBeInTheDocument();
    expect(screen.getByText(/Vô hiệu hóa tài khoản/i)).toBeInTheDocument();

    // Confirm that physical DELETE action button is NOT rendered
    expect(screen.queryByRole('button', { name: /Xác nhận xóa vĩnh viễn/i })).not.toBeInTheDocument();
  });

  it('safe delete UX: allows ELIGIBLE clean-slate account deletion only after typing exact username', async () => {
    let deleteCalled = false;
    let deleteBody: unknown = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return jsonResponse(
          auth(
            { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'SYSTEM_ADMIN', scope: 'SCHOOL_WIDE' },
          ),
        );
      }
      if (url.includes('/api/users/u-clean-2/delete-preflight')) {
        return jsonResponse({
          targetUserId: 'u-clean-2',
          username: 'gv_clean_slate',
          displayName: 'Trần Thị Thu',
          eligibility: 'ELIGIBLE',
          blockers: [],
          cleanupCounts: { staffProfiles: 1, subjectGroupMemberships: 0, staffSubjects: 0 },
          disableRecommended: false,
        });
      }
      if (url.includes('/api/users/u-clean-2') && init?.method === 'DELETE') {
        deleteCalled = true;
        deleteBody = JSON.parse(String(init.body));
        return jsonResponse({ success: true, deletedUsername: 'gv_clean_slate' });
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_clean_slate' }));

    const deleteTab = screen.getByRole('button', { name: /Xóa tài khoản an toàn/i });
    await user.click(deleteTab);

    // Verify ELIGIBLE banner
    expect(await screen.findByText(/TÀI KHOẢN SẠCH — ĐỦ ĐIỀU KIỆN XÓA/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Xác nhận xóa vĩnh viễn/i });
    // Button is disabled before typing username
    expect(confirmBtn).toBeDisabled();

    // Type wrong username
    const input = screen.getByLabelText(/Nhập tên đăng nhập để xác nhận/i);
    await user.type(input, 'wrong_username');
    expect(confirmBtn).toBeDisabled();

    // Type exact username
    await user.clear(input);
    await user.type(input, 'gv_clean_slate');
    expect(confirmBtn).not.toBeDisabled();

    // Submit deletion
    await user.click(confirmBtn);
    await waitFor(() => expect(deleteCalled).toBe(true));
    expect(deleteBody).toEqual({ confirmUsername: 'gv_clean_slate' });

    // Success feedback rendered and selection cleared
    expect(await screen.findByText(/Đã xóa vĩnh viễn tài khoản gv_clean_slate/i)).toBeInTheDocument();
  });

  it('safe delete UX: prevents deletion when administrator lacks SYSTEM_ADMIN capability', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        // Has USER_MANAGE but lacks SYSTEM_ADMIN
        return jsonResponse(auth({ key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' }));
      }
      if (url.includes('/api/users/u-clean-2/delete-preflight')) {
        return jsonResponse({
          targetUserId: 'u-clean-2',
          username: 'gv_clean_slate',
          displayName: 'Trần Thị Thu',
          eligibility: 'ELIGIBLE',
          blockers: [],
          cleanupCounts: { staffProfiles: 1, subjectGroupMemberships: 0, staffSubjects: 0 },
          disableRecommended: false,
        });
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_clean_slate' }));

    const deleteTab = screen.getByRole('button', { name: /Xóa tài khoản an toàn/i });
    await user.click(deleteTab);

    // Shows insufficient authority notice
    expect(await screen.findByText(/Thẩm quyền không đủ/i)).toBeInTheDocument();
    // Confirms physical deletion confirmation button is not rendered
    expect(screen.queryByRole('button', { name: /Xác nhận xóa vĩnh viễn/i })).not.toBeInTheDocument();
  });
});
