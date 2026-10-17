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

  const mockTemplates = [
    {
      key: 'TEACHER',
      name: 'Giáo viên',
      description: 'Chuẩn chuyên môn giảng dạy',
      version: 'v1',
      requiresTeachingStaff: true,
      requiredResourceKind: 'NONE',
      sourceAuthorityGrants: [],
      productOperabilityGrants: [],
      forbiddenDefaults: [],
      notes: ['Mẫu chuẩn chuyên môn áp dụng cho tất cả giáo viên.'],
    },
    {
      key: 'SUBJECT_LEADER',
      name: 'Tổ trưởng chuyên môn',
      description: 'Quản lý tổ chuyên môn',
      version: 'v1',
      requiresTeachingStaff: true,
      requiredResourceKind: 'SUBJECT_GROUP',
      sourceAuthorityGrants: [],
      productOperabilityGrants: [],
      forbiddenDefaults: [],
      notes: [],
    },
    {
      key: 'GDDP_COORDINATOR',
      name: 'Điều phối Giáo dục địa phương (GDĐP)',
      description: 'Điều phối chương trình GDĐP',
      version: 'v1',
      requiresTeachingStaff: true,
      requiredResourceKind: 'ACTIVITY',
      sourceAuthorityGrants: [],
      productOperabilityGrants: [],
      forbiddenDefaults: [],
      notes: [],
    },
    {
      key: 'HDTN_COORDINATOR',
      name: 'Điều phối HĐTN-HN',
      description: 'Điều phối hoạt động trải nghiệm',
      version: 'v1',
      requiresTeachingStaff: true,
      requiredResourceKind: 'ACTIVITY',
      sourceAuthorityGrants: [],
      productOperabilityGrants: [],
      forbiddenDefaults: [],
      notes: [],
    },
  ];

  it('renders split workspace, truthful search label Tìm trong trang hiện tại, allows user selection and tab switching', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    expect(await screen.findByText('Nguyễn Văn Bình')).toBeInTheDocument();
    expect(screen.getByText('Trần Thị Thu')).toBeInTheDocument();

    // Verify search truthful labeling
    expect(screen.getByLabelText('Tìm trong trang hiện tại')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tìm trong trang hiện tại/i)).toBeInTheDocument();

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

  it('runs responsibility template preview and apply flow for TEACHER template with server-owned catalog', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
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

    // Wait for server-owned template catalog to load
    expect(await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i)).toBeInTheDocument();
    expect(screen.getByText(/Chuẩn chuyên môn giảng dạy/i)).toBeInTheDocument();

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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
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
    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'SUBJECT_LEADER');

    // Verify required subjectGroupId selector and exact label for subjectIds
    expect(await screen.findByLabelText(/Tổ chuyên môn phụ trách/i)).toBeInTheDocument();
    expect(
      screen.getByText('Môn chuyên môn được giao cho tổ trưởng (Tùy chọn):'),
    ).toBeInTheDocument();
    expect(screen.getByText('Môn Toán (TOAN)')).toBeInTheDocument();
    expect(screen.getByText('Môn Tin học (TIN)')).toBeInTheDocument();
  });

  it('snapshot integrity: preview -> change subject -> Apply button is unavailable', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/api/subject-groups')) {
        return jsonResponse(page([{ id: 'sg-math', code: 'TOAN_TIN', name: 'Tổ Toán - Tin', status: 'ACTIVE' }]));
      }
      if (url.includes('/api/subjects')) {
        return jsonResponse(page([
          { id: 's-math', code: 'TOAN', name: 'Môn Toán', status: 'ACTIVE' },
          { id: 's-cs', code: 'TIN', name: 'Môn Tin học', status: 'ACTIVE' },
        ]));
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview') && init?.method === 'POST') {
        return jsonResponse({
          templateKey: 'SUBJECT_LEADER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'SUBJECT_GROUP', provided: true },
          grantsToAdd: [{ capabilityKey: 'SUBJECT_GROUP_LEAD', scopeType: 'SUBJECT_GROUP', description: 'Tổ trưởng chuyên môn' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        });
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'SUBJECT_LEADER');

    // Select subject group
    const groupSelect = await screen.findByLabelText(/Tổ chuyên môn phụ trách/i);
    await user.selectOptions(groupSelect, 'sg-math');

    // Preview
    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn);

    // Apply button appears
    expect(await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).toBeInTheDocument();

    // Now change subject selection: check 'Môn Toán'
    const mathCheckbox = screen.getByRole('checkbox', { name: /Môn Toán/i });
    await user.click(mathCheckbox);

    // Apply button MUST disappear because selection diverged from preview snapshot
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
  });

  it('snapshot integrity: preview -> change subject group -> Apply button is unavailable', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/api/subject-groups')) {
        return jsonResponse(page([
          { id: 'sg-math', code: 'TOAN_TIN', name: 'Tổ Toán - Tin', status: 'ACTIVE' },
          { id: 'sg-lit', code: 'VAN', name: 'Tổ Ngữ Văn', status: 'ACTIVE' },
        ]));
      }
      if (url.includes('/api/subjects')) return jsonResponse(page([]));
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview') && init?.method === 'POST') {
        return jsonResponse({
          templateKey: 'SUBJECT_LEADER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'SUBJECT_GROUP', provided: true },
          grantsToAdd: [{ capabilityKey: 'SUBJECT_GROUP_LEAD', scopeType: 'SUBJECT_GROUP', description: 'Tổ trưởng' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        });
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'SUBJECT_LEADER');

    const groupSelect = await screen.findByLabelText(/Tổ chuyên môn phụ trách/i);
    await user.selectOptions(groupSelect, 'sg-math');

    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn);

    expect(await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).toBeInTheDocument();

    // Change subject group to another one
    await user.selectOptions(groupSelect, 'sg-lit');

    // Apply button MUST disappear
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
  });

  it('snapshot integrity: preview -> switch user -> stale preview is cleared and ignored', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview') && init?.method === 'POST') {
        return jsonResponse({
          templateKey: 'TEACHER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'NONE', provided: true },
          grantsToAdd: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'SCHOOL_WIDE', description: 'Quyền cơ sở' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        });
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));
    await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);

    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn);

    expect(await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).toBeInTheDocument();

    // Switch to another user: Trần Thị Thu
    await user.click(screen.getByRole('button', { name: 'Chọn gv_clean_slate' }));

    // The old preview and Apply button MUST NOT be present for the newly selected user
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Quyền cơ sở')).not.toBeInTheDocument();
  });

  it('snapshot integrity: server 409 conflict on apply -> shows conflict notice and does NOT claim success', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview') && init?.method === 'POST') {
        return jsonResponse({
          templateKey: 'TEACHER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'NONE', provided: true },
          grantsToAdd: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'SCHOOL_WIDE', description: 'Quyền cơ sở' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/apply') && init?.method === 'POST') {
        // Return 409 Conflict
        return jsonResponse({ statusCode: 409, message: 'Conflict: user grants changed concurrently.' }, 409);
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));
    await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);

    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn);

    const applyBtn = await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i });
    await user.click(applyBtn);

    // Verify 409 error message is displayed
    expect(await screen.findByText(/Xung đột \(409\)/i)).toBeInTheDocument();
    // Verify NO fake success message
    expect(screen.queryByText(/Đã áp dụng thành công/i)).not.toBeInTheDocument();
  });

  it('disables apply and displays truthful blocker when coordinator lookup lacks administrative read-model', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/programme-planning/masters')) {
        // Backend returns 403 when user lacks coordinator master lookup
        return jsonResponse({ statusCode: 403, message: 'Forbidden: missing read authority.' }, 403);
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    // Select GDDP_COORDINATOR
    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    // Truthful blocker banner is rendered
    expect(
      await screen.findByText(/Yêu cầu mô hình đọc tài nguyên quản trị/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/403 \(Không có quyền\)/i)).toBeInTheDocument();

    // Preview button is disabled
    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    expect(previewBtn).toBeDisabled();
    // Apply button is NOT rendered
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
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
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
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
