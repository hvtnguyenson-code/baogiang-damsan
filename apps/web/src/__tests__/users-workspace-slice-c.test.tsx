import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const page = (items: unknown[] = []) => ({ items, page: 1, pageSize: 20, total: items.length });
const auth = (...capabilities: Array<{ key: string; scope: string; resourceId?: string }>) => ({
  ...normalAuth,
  capabilities,
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
          applied: true,
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

    // Result feedback is shown with detailed retained result
    expect(
      await screen.findByText(/Đã áp dụng thành công Mẫu trách nhiệm \(Giáo viên\): đã cấp mới 2 quyền/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Số quyền đã cấp mới:/i)).toBeInTheDocument();
    expect(screen.getByText('HOÀN THÀNH')).toBeInTheDocument();
    // Old preview is invalidated and Apply button is unrendered
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
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

  it('C3-01: server 409 on apply -> wipes preview snapshot, disables Apply, and requires fresh preview before retry', async () => {
    let applyAttempts = 0;
    let previewAttempts = 0;

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
        previewAttempts++;
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
        applyAttempts++;
        if (applyAttempts === 1) {
          // First attempt returns 409 Conflict
          return jsonResponse({ statusCode: 409, message: 'Conflict: user grants changed concurrently.' }, 409);
        }
        // Second attempt succeeds
        return jsonResponse({
          applied: true,
          templateKey: 'TEACHER',
          version: '1.0.0',
          grantsAdded: [{ id: 'g-1', capabilityKey: 'TEACHER_BASE', scopeType: 'SCHOOL_WIDE' }],
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
    await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);

    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn);

    const applyBtn = await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i });
    await user.click(applyBtn);

    // 1. Verify 409 error message is displayed
    expect(await screen.findByText(/Hãy kiểm tra quyền trước khi áp dụng lại mẫu/i)).toBeInTheDocument();
    // 2. Verify NO fake success message
    expect(screen.queryByText(/Đã áp dụng thành công/i)).not.toBeInTheDocument();
    // 3. Verify Apply button is unavailable from rejected preview
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
    // 4. Verify stale preview result is wiped
    expect(screen.queryByText(/Kết quả kiểm tra trước:/i)).not.toBeInTheDocument();

    // 5. User clicks Preview again to re-evaluate truth
    await user.click(previewBtn);
    await waitFor(() => expect(previewAttempts).toBe(2));

    // 6. Apply button is available only after fresh valid preview
    const secondApplyBtn = await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i });
    expect(secondApplyBtn).not.toBeDisabled();

    // 7. Click Apply on new preview -> succeeds and shows detailed apply result
    await user.click(secondApplyBtn);
    await waitFor(() => expect(applyAttempts).toBe(2));
    expect(
      await screen.findByText(/Đã áp dụng thành công Mẫu trách nhiệm \(Giáo viên\): đã cấp mới 1 quyền/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Số quyền đã cấp mới:/i)).toBeInTheDocument();
    expect(screen.getByText('HOÀN THÀNH')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
  });

  it('C3-02: apply result is retained with all required fields and cleared when switching user', async () => {
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
          alreadyPresent: [{ capabilityKey: 'EXISTING_ONE', scopeType: 'SCHOOL_WIDE', description: 'Quyền có sẵn' }],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/apply') && init?.method === 'POST') {
        return jsonResponse({
          applied: true,
          templateKey: 'TEACHER',
          version: '1.0.0',
          grantsAdded: [{ id: 'g-1', capabilityKey: 'TEACHER_BASE', scopeType: 'SCHOOL_WIDE' }],
          alreadyPresent: [{ capabilityKey: 'EXISTING_ONE', scopeType: 'SCHOOL_WIDE', description: 'Quyền có sẵn' }],
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

    const applyBtn = await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i });
    await user.click(applyBtn);

    // Verify all required fields of apply result are retained
    expect(await screen.findByText(/Số quyền đã cấp mới:/i)).toBeInTheDocument();
    expect(screen.getByText(/Số quyền đã có sẵn:/i)).toBeInTheDocument();
    expect(screen.getByText('HOÀN THÀNH')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();

    // Switch to another user -> apply result is cleared and does not linger
    await user.click(screen.getByRole('button', { name: 'Chọn gv_clean_slate' }));
    expect(screen.queryByText(/Số quyền đã cấp mới:/i)).not.toBeInTheDocument();
    expect(screen.queryByText('HOÀN THÀNH')).not.toBeInTheDocument();
  });

  it('async snapshot regression: preview A in-flight -> switch user to B -> response A arrives -> discarded, Apply unavailable', async () => {
    const deferredA = createDeferred<Response>();
    let previewACalled = false;

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
        previewACalled = true;
        return deferredA.promise;
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
    await waitFor(() => expect(previewACalled).toBe(true));

    // While preview A is in-flight, switch user to gv_clean_slate
    await user.click(screen.getByRole('button', { name: 'Chọn gv_clean_slate' }));

    // Now resolve preview A
    await act(async () => {
      deferredA.resolve(
        jsonResponse({
          templateKey: 'TEACHER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'NONE', provided: true },
          grantsToAdd: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'SCHOOL_WIDE', description: 'Quyền cơ sở' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        }),
      );
      await new Promise((r) => setTimeout(r, 60));
    });

    // Stale response A must be discarded for user B
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Quyền cơ sở')).not.toBeInTheDocument();
    expect(screen.queryByText(/Kết quả kiểm tra trước:/i)).not.toBeInTheDocument();
  });

  it('async snapshot regression: preview A in-flight -> change template -> response A arrives late -> discarded, Apply unavailable', async () => {
    const deferredA = createDeferred<Response>();
    let previewACalled = false;

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
      if (url.includes('/api/catalogs/subject-groups')) {
        return jsonResponse({ items: [{ id: 'sg-1', code: 'TOAN', name: 'Tổ Toán' }] });
      }
      if (url.includes('/api/catalogs/subjects')) {
        return jsonResponse({ items: [{ id: 'sub-1', code: 'TOAN10', name: 'Toán 10' }] });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview') && init?.method === 'POST') {
        previewACalled = true;
        return deferredA.promise;
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));
    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);

    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn);
    await waitFor(() => expect(previewACalled).toBe(true));

    // While preview A is in-flight, change template dropdown to SUBJECT_LEADER
    await user.selectOptions(templateSelect, 'SUBJECT_LEADER');

    // Now resolve preview A (for TEACHER)
    await act(async () => {
      deferredA.resolve(
        jsonResponse({
          templateKey: 'TEACHER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'NONE', provided: true },
          grantsToAdd: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'SCHOOL_WIDE', description: 'Quyền cơ sở' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        }),
      );
      await new Promise((r) => setTimeout(r, 60));
    });

    // Stale response A must not enable Apply or render preview delta
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Quyền cơ sở')).not.toBeInTheDocument();
  });

  it('async snapshot regression: ABA scenario - preview A in-flight -> switch to B -> switch back to A -> old response A arrives -> discarded, Apply unavailable', async () => {
    const deferredA = createDeferred<Response>();
    let previewACalled = false;

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
        previewACalled = true;
        return deferredA.promise;
      }
      if (url.includes('/api/users')) return jsonResponse(page(mockUsers));
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/quan-tri/nguoi-dung');

    // Step A: Select u-teacher-1 and start preview
    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));
    await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn);
    await waitFor(() => expect(previewACalled).toBe(true));

    // Step B: Switch to u-clean-2
    await user.click(screen.getByRole('button', { name: 'Chọn gv_clean_slate' }));

    // Step A again: Switch back to u-teacher-1 BEFORE response A returns
    await user.click(screen.getByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    // Now resolve the old deferred response A from the first interaction
    await act(async () => {
      deferredA.resolve(
        jsonResponse({
          templateKey: 'TEACHER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'NONE', provided: true },
          grantsToAdd: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'SCHOOL_WIDE', description: 'Quyền cơ sở ABA' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        }),
      );
      await new Promise((r) => setTimeout(r, 60));
    });

    // Must be rejected because generation/request ID changed on selection reset
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Quyền cơ sở ABA')).not.toBeInTheDocument();
    expect(screen.queryByText(/Kết quả kiểm tra trước:/i)).not.toBeInTheDocument();
  });

  it('async snapshot regression: out-of-order responses - preview 1 slow, preview 2 fast -> only preview 2 result is preserved', async () => {
    const deferred1 = createDeferred<Response>();
    const deferred2 = createDeferred<Response>();
    let previewCalls = 0;

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
      if (url.includes('/responsibility-templates/preview') && init?.method === 'POST') {
        previewCalls++;
        return previewCalls === 1 ? deferred1.promise : deferred2.promise;
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

    // Trigger Preview 1 on gv_nguyenvanb
    await user.click(previewBtn);
    await waitFor(() => expect(previewCalls).toBe(1));

    // While Preview 1 is in-flight, user selects gv_clean_slate and triggers Preview 2
    await user.click(screen.getByRole('button', { name: 'Chọn gv_clean_slate' }));
    const previewBtn2 = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn2);
    await waitFor(() => expect(previewCalls).toBe(2));

    // Preview 2 resolves first
    await act(async () => {
      deferred2.resolve(
        jsonResponse({
          templateKey: 'TEACHER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'NONE', provided: true },
          grantsToAdd: [{ capabilityKey: 'NEW_GRANTS_2', scopeType: 'SCHOOL_WIDE', description: 'Kết quả xem trước mới' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        }),
      );
    });

    expect(await screen.findByText('Kết quả xem trước mới')).toBeInTheDocument();

    // Now Preview 1 resolves later (out-of-order)
    await act(async () => {
      deferred1.resolve(
        jsonResponse({
          templateKey: 'TEACHER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'NONE', provided: true },
          grantsToAdd: [{ capabilityKey: 'STALE_GRANTS_1', scopeType: 'SCHOOL_WIDE', description: 'Kết quả xem trước cũ' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        }),
      );
      await new Promise((r) => setTimeout(r, 60));
    });

    // Only Preview 2 result must remain; Preview 1 must not overwrite it
    expect(screen.getByText('Kết quả xem trước mới')).toBeInTheDocument();
    expect(screen.queryByText('Kết quả xem trước cũ')).not.toBeInTheDocument();
  });

  it('async snapshot regression: old preview request fails after new preview succeeds -> stale error does NOT wipe new preview', async () => {
    const deferred1 = createDeferred<Response>();
    const deferred2 = createDeferred<Response>();
    let previewCalls = 0;

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
      if (url.includes('/responsibility-templates/preview') && init?.method === 'POST') {
        previewCalls++;
        return previewCalls === 1 ? deferred1.promise : deferred2.promise;
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

    // Trigger Preview 1 on gv_nguyenvanb
    await user.click(previewBtn);
    await waitFor(() => expect(previewCalls).toBe(1));

    // While Preview 1 is in-flight, user selects gv_clean_slate and triggers Preview 2
    await user.click(screen.getByRole('button', { name: 'Chọn gv_clean_slate' }));
    const previewBtn2 = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn2);
    await waitFor(() => expect(previewCalls).toBe(2));

    // Preview 2 succeeds
    await act(async () => {
      deferred2.resolve(
        jsonResponse({
          templateKey: 'TEACHER',
          version: '1.0.0',
          eligibility: { isEligible: true },
          requiredResources: { kind: 'NONE', provided: true },
          grantsToAdd: [{ capabilityKey: 'SUCCESS_GRANT', scopeType: 'SCHOOL_WIDE', description: 'Quyền thành công số 2' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        }),
      );
    });

    expect(await screen.findByText('Quyền thành công số 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).toBeInTheDocument();

    // Now Preview 1 rejects with an error
    await act(async () => {
      deferred1.reject(new Error('Stale connection reset error'));
      await new Promise((r) => setTimeout(r, 60));
    });

    // Preview 2 result and Apply button must NOT be wiped by the stale error
    expect(screen.getByText('Quyền thành công số 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).toBeInTheDocument();
    expect(screen.queryByText(/Stale connection reset error/i)).not.toBeInTheDocument();
  });

  it('disables apply and displays truthful error notice when academic-year-options returns error', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates/academic-year-options')) {
        return jsonResponse({ statusCode: 403, message: 'Forbidden: missing read authority.' }, 403);
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

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    // Select GDDP_COORDINATOR
    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    // Truthful error notice is rendered
    expect(
      await screen.findByText(/Không thể tải danh mục năm học/i),
    ).toBeInTheDocument();

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
    expect(await screen.findByText(/Tài khoản không đủ điều kiện xóa vĩnh viễn/i)).toBeInTheDocument();
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
    expect(await screen.findByText(/Đủ điều kiện xóa theo lần kiểm tra này/i)).toBeInTheDocument();

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

  it('coordinator UX: loads academic years and programme masters via administrative read-model, enables Preview and Apply for GDDP_COORDINATOR', async () => {
    let applyPayload: unknown = null;
    let previewPayload: unknown = null;

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
      if (url.includes('/api/capabilities/responsibility-templates/academic-year-options')) {
        return jsonResponse({
          items: [
            { id: 'year-2026', code: '2026_2027', name: 'Năm học 2026-2027' },
            { id: 'year-2025', code: '2025_2026', name: 'Năm học 2025-2026' },
          ],
          total: 2,
          page: 1,
          pageSize: 100,
          totalPages: 1,
        });
      }
      if (url.includes('/api/capabilities/responsibility-templates/programme-master-options')) {
        return jsonResponse({
          items: [
            { id: 'm-gddp-10', academicYearId: 'year-2026', kind: 'GDDP', gradeLevel: 10 },
            { id: 'm-gddp-11', academicYearId: 'year-2026', kind: 'GDDP', gradeLevel: 11 },
          ],
          total: 2,
          page: 1,
          pageSize: 100,
          totalPages: 1,
        });
      }
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview') && init?.method === 'POST') {
        previewPayload = JSON.parse(String(init.body));
        return jsonResponse({
          templateKey: 'GDDP_COORDINATOR',
          version: 'v1',
          targetUser: { id: 'u-teacher-1', username: 'gv_nguyenvanb', displayName: 'Nguyễn Văn Bình', isTeachingStaff: true, status: 'ACTIVE' },
          eligibility: { isEligible: true },
          requiredResources: { kind: 'ACTIVITY', provided: true, resolvedProgrammeMasterId: 'm-gddp-10', details: 'GDĐP (Khối 10)' },
          grantsToAdd: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: 'm-gddp-10', description: 'Điều phối GDĐP Khối 10' }],
          alreadyPresent: [],
          conflicts: [],
          forbiddenDefaults: [],
          notes: [],
        });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/apply') && init?.method === 'POST') {
        applyPayload = JSON.parse(String(init.body));
        return jsonResponse({
          applied: true,
          templateKey: 'GDDP_COORDINATOR',
          version: 'v1',
          targetUserId: 'u-teacher-1',
          grantsAdded: [{ id: 'grant-coord-1', capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: 'm-gddp-10' }],
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

    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    // Select academic year
    const yearSelect = await screen.findByLabelText(/Chọn năm học cho mẫu điều phối/i);
    await user.selectOptions(yearSelect, 'year-2026');

    // Select programme master
    const masterSelect = await screen.findByLabelText(/Chọn chương trình đào tạo cho mẫu điều phối/i);
    await user.selectOptions(masterSelect, 'm-gddp-10');

    // Preview button should be enabled
    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    expect(previewBtn).not.toBeDisabled();
    await user.click(previewBtn);

    // Assert preview payload was sent correctly
    await waitFor(() => expect(previewPayload).toEqual({
      templateKey: 'GDDP_COORDINATOR',
      resources: { programmeMasterId: 'm-gddp-10' },
      programmeMasterId: 'm-gddp-10',
    }));

    // Apply button appears
    const applyBtn = await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i });
    expect(applyBtn).toBeInTheDocument();
    await user.click(applyBtn);

    // Assert apply payload
    await waitFor(() => expect(applyPayload).toEqual({
      templateKey: 'GDDP_COORDINATOR',
      resources: { programmeMasterId: 'm-gddp-10' },
      programmeMasterId: 'm-gddp-10',
    }));

    // Success notice
    expect(await screen.findByText(/Đã áp dụng thành công Mẫu trách nhiệm/i)).toBeInTheDocument();
  });

  it('coordinator UX: displays warning notice when selected academic year has no programme masters', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates/academic-year-options')) {
        return jsonResponse({
          items: [{ id: 'year-empty', code: '2026_EMPTY', name: 'Năm học Chưa có CT' }],
          total: 1,
          page: 1,
          pageSize: 100,
          totalPages: 1,
        });
      }
      if (url.includes('/api/capabilities/responsibility-templates/programme-master-options')) {
        return jsonResponse({
          items: [],
          total: 0,
          page: 1,
          pageSize: 100,
          totalPages: 0,
        });
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

    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    // Auto-selected single academic year, and empty programme warning rendered
    expect(await screen.findByText(/Năm học này chưa có chương trình đào tạo nào/i)).toBeInTheDocument();

    // Preview button remains disabled because no programme master is selected
    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    expect(previewBtn).toBeDisabled();
  });

  it('coordinator UX C1-PAGINATION: supports browsing >100 academic years and >100 masters across pages without silent truncation', async () => {
    let previewPayload: unknown = null;
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
      if (url.includes('/api/capabilities/responsibility-templates/academic-year-options')) {
        const urlObj = new URL(url, 'http://localhost');
        const pageParam = Number(urlObj.searchParams.get('page') || '1');
        if (pageParam === 1) {
          const items = Array.from({ length: 50 }, (_, i) => ({
            id: `year-${i + 1}`,
            code: `202${i + 1}`,
            name: `Năm học ${i + 1}`,
          }));
          return jsonResponse({ items, total: 105, page: 1, pageSize: 50, totalPages: 3 });
        }
        if (pageParam === 2) {
          const items = Array.from({ length: 50 }, (_, i) => ({
            id: `year-${i + 51}`,
            code: `202${i + 51}`,
            name: `Năm học ${i + 51}`,
          }));
          return jsonResponse({ items, total: 105, page: 2, pageSize: 50, totalPages: 3 });
        }
        const items = Array.from({ length: 5 }, (_, i) => ({
          id: `year-${i + 101}`,
          code: `203${i + 1}`,
          name: `Năm học ${i + 101}`,
        }));
        return jsonResponse({ items, total: 105, page: 3, pageSize: 50, totalPages: 3 });
      }
      if (url.includes('/api/capabilities/responsibility-templates/programme-master-options')) {
        const urlObj = new URL(url, 'http://localhost');
        const pageParam = Number(urlObj.searchParams.get('page') || '1');
        const yearId = urlObj.searchParams.get('academicYearId');
        if (pageParam === 1) {
          const items = Array.from({ length: 50 }, (_, i) => ({
            id: `master-${i + 1}`,
            academicYearId: yearId || 'year-101',
            kind: 'GDDP',
            gradeLevel: 10,
          }));
          return jsonResponse({ items, total: 105, page: 1, pageSize: 50, totalPages: 3 });
        }
        if (pageParam === 2) {
          const items = Array.from({ length: 50 }, (_, i) => ({
            id: `master-${i + 51}`,
            academicYearId: yearId || 'year-101',
            kind: 'GDDP',
            gradeLevel: 11,
          }));
          return jsonResponse({ items, total: 105, page: 2, pageSize: 50, totalPages: 3 });
        }
        const items = Array.from({ length: 5 }, (_, i) => ({
          id: `master-${i + 101}`,
          academicYearId: yearId || 'year-101',
          kind: 'GDDP',
          gradeLevel: 12,
        }));
        return jsonResponse({ items, total: 105, page: 3, pageSize: 50, totalPages: 3 });
      }
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview')) {
        previewPayload = JSON.parse(String(init?.body));
        return jsonResponse({
          templateKey: 'GDDP_COORDINATOR',
          version: 'v1',
          targetUser: { id: 'u-teacher-1', username: 'gv_nguyenvanb', displayName: 'Nguyễn Văn Bình', isTeachingStaff: true, status: 'ACTIVE' },
          eligibility: { isEligible: true },
          requiredResources: { kind: 'ACTIVITY', provided: true, resolvedProgrammeMasterId: 'master-55', details: 'GDĐP (Khối 11)' },
          grantsToAdd: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: 'master-55', description: 'Điều phối GDĐP Khối 11' }],
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
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    // Shows total academic years
    expect(await screen.findByText(/Tổng: 105 năm học/i)).toBeInTheDocument();

    // Navigate to page 3 of academic years
    const getYearNav = () => screen.getByRole('navigation', { name: 'Phân trang năm học' });
    await user.click(within(getYearNav()).getByRole('button', { name: 'Trang sau (năm học)' }));
    await waitFor(() => expect(getYearNav()).toHaveTextContent(/Trang 2 \/ 3/));
    await user.click(within(getYearNav()).getByRole('button', { name: 'Trang sau (năm học)' }));
    await waitFor(() => expect(getYearNav()).toHaveTextContent(/Trang 3 \/ 3/));

    // Select year-101 from page 3
    const yearSelect = await screen.findByLabelText(/Chọn năm học cho mẫu điều phối/i);
    await user.selectOptions(yearSelect, 'year-101');

    // Programme masters loaded for year-101, showing 105 masters
    expect(await screen.findByText(/Tổng: 105 chương trình/i)).toBeInTheDocument();

    // Navigate to page 2 of programme masters
    const getMasterNav = () => screen.getByRole('navigation', { name: 'Phân trang chương trình' });
    await user.click(within(getMasterNav()).getByRole('button', { name: 'Trang sau (chương trình)' }));
    await waitFor(() => expect(getMasterNav()).toHaveTextContent(/Trang 2 \/ 3/));

    // Select master-55 from page 2
    const masterSelect = await screen.findByLabelText(/Chọn chương trình đào tạo cho mẫu điều phối/i);
    await user.selectOptions(masterSelect, 'master-55');

    // Valid selection notice displayed
    expect(await screen.findByText(/Đã chọn tài nguyên chương trình hợp lệ/i)).toBeInTheDocument();

    // Preview button should be enabled
    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    expect(previewBtn).not.toBeDisabled();
    await user.click(previewBtn);

    await waitFor(() => expect(previewPayload).toEqual({
      templateKey: 'GDDP_COORDINATOR',
      resources: { programmeMasterId: 'master-55' },
      programmeMasterId: 'master-55',
    }));
  });

  it('coordinator UX C1-AUTO-SELECT: auto-selects only when catalog total === 1, does NOT auto-select when total > 1 even if current page items length is 1', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates/academic-year-options')) {
        // Return 1 item on this page, but total is 2 (e.g. page 2 of 2)
        return jsonResponse({
          items: [{ id: 'year-p2', code: '2027_2028', name: 'Năm học 2027-2028 (Trang 2)' }],
          total: 2,
          page: 2,
          pageSize: 1,
          totalPages: 2,
        });
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
    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    const yearSelect = (await screen.findByLabelText(/Chọn năm học cho mẫu điều phối/i)) as HTMLSelectElement;

    // Must NOT auto-select because total is 2 (even though items.length === 1)
    expect(yearSelect.value).toBe('');
    expect(screen.getByRole('button', { name: /Xem trước thay đổi quyền/i })).toBeDisabled();
  });

  it('coordinator UX C2-FAIL-CLOSED: same-key refetch pending invalidates preview & hides Apply, and 403 keeps it blocked', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    let refetchResolver: ((val: Response) => void) | null = null;
    let masterRequestCount = 0;

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
      if (url.includes('/api/capabilities/responsibility-templates/academic-year-options')) {
        return jsonResponse({
          items: [{ id: 'year-2026', code: '2026_2027', name: 'Năm học 2026-2027' }],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        });
      }
      if (url.includes('/api/capabilities/responsibility-templates/programme-master-options')) {
        masterRequestCount++;
        if (masterRequestCount === 1) {
          return jsonResponse({
            items: [{ id: 'm-gddp-10', academicYearId: 'year-2026', kind: 'GDDP', gradeLevel: 10 }],
            total: 1,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          });
        }
        // Second request is in-flight pending refetch on SAME queryKey
        return new Promise<Response>((resolve) => {
          refetchResolver = resolve;
        });
      }
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview') && init?.method === 'POST') {
        return jsonResponse({
          templateKey: 'GDDP_COORDINATOR',
          version: 'v1',
          targetUser: { id: 'u-teacher-1', username: 'gv_nguyenvanb', displayName: 'Nguyễn Văn Bình', isTeachingStaff: true, status: 'ACTIVE' },
          eligibility: { isEligible: true },
          requiredResources: { kind: 'ACTIVITY', provided: true, resolvedProgrammeMasterId: 'm-gddp-10', details: 'GDĐP (Khối 10)' },
          grantsToAdd: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: 'm-gddp-10', description: 'Điều phối GDĐP Khối 10' }],
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

    renderApp('/quan-tri/nguoi-dung', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    // Auto-selected year-2026 because total === 1
    const masterSelect = await screen.findByLabelText(/Chọn chương trình đào tạo cho mẫu điều phối/i);
    await user.selectOptions(masterSelect, 'm-gddp-10');

    expect(await screen.findByText(/Đã chọn tài nguyên chương trình hợp lệ/i)).toBeInTheDocument();

    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    expect(previewBtn).not.toBeDisabled();
    await user.click(previewBtn);

    // Apply button appears
    const applyBtn = await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i });
    expect(applyBtn).toBeInTheDocument();

    // Trigger refetch on SAME queryKey WITHOUT switching template, user, year or master
    act(() => {
      queryClient.refetchQueries({ queryKey: ['programme-master-options'] });
    });

    // IMMEDIATELY while refetch is pending (isFetching === true):
    // 1. Apply button must be absent/removed
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
    });
    // 2. Preview button must be disabled
    expect(screen.getByRole('button', { name: /Xem trước thay đổi quyền/i })).toBeDisabled();
    // 3. Selection valid notice must be absent
    expect(screen.queryByText(/Đã chọn tài nguyên chương trình hợp lệ/i)).not.toBeInTheDocument();

    // NOW: Resolve refetch with 403 Forbidden
    act(() => {
      if (refetchResolver) {
        refetchResolver(
          new Response(JSON.stringify({ statusCode: 403, message: 'Forbidden: access revoked' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
    });

    // After 403 resolution:
    // 1. Error message must appear
    expect(await screen.findByText(/Tài khoản chưa được cấp quyền thực hiện thao tác này/i)).toBeInTheDocument();
    // 2. Apply button remains absent
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
    // 3. Preview button remains disabled
    expect(screen.getByRole('button', { name: /Xem trước thay đổi quyền/i })).toBeDisabled();
  });

  it('coordinator UX C2-MEMBERSHIP: same-key refetch succeeds without selected master -> invalidates preview and prevents apply', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    let masterRequestCount = 0;

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
      if (url.includes('/api/capabilities/responsibility-templates/academic-year-options')) {
        return jsonResponse({
          items: [{ id: 'year-2026', code: '2026_2027', name: 'Năm học 2026-2027' }],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        });
      }
      if (url.includes('/api/capabilities/responsibility-templates/programme-master-options')) {
        masterRequestCount++;
        if (masterRequestCount === 1) {
          return jsonResponse({
            items: [{ id: 'm-gddp-10', academicYearId: 'year-2026', kind: 'GDDP', gradeLevel: 10 }],
            total: 1,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          });
        }
        // Second request (refetch): m-gddp-10 has been removed on server, only m-gddp-11 exists now
        return jsonResponse({
          items: [{ id: 'm-gddp-11', academicYearId: 'year-2026', kind: 'GDDP', gradeLevel: 11 }],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        });
      }
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview') && init?.method === 'POST') {
        return jsonResponse({
          templateKey: 'GDDP_COORDINATOR',
          version: 'v1',
          targetUser: { id: 'u-teacher-1', username: 'gv_nguyenvanb', displayName: 'Nguyễn Văn Bình', isTeachingStaff: true, status: 'ACTIVE' },
          eligibility: { isEligible: true },
          requiredResources: { kind: 'ACTIVITY', provided: true, resolvedProgrammeMasterId: 'm-gddp-10', details: 'GDĐP (Khối 10)' },
          grantsToAdd: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: 'm-gddp-10', description: 'Điều phối GDĐP Khối 10' }],
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

    renderApp('/quan-tri/nguoi-dung', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    const masterSelect = await screen.findByLabelText(/Chọn chương trình đào tạo cho mẫu điều phối/i);
    await user.selectOptions(masterSelect, 'm-gddp-10');

    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn);

    // Apply button appears
    expect(await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).toBeInTheDocument();

    // Refetch same queryKey - server no longer returns m-gddp-10
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['programme-master-options'] });
    });

    // 1. Apply button must be gone immediately
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
    });
    // 2. Selection valid notice must NOT appear
    expect(screen.queryByText(/Đã chọn tài nguyên chương trình hợp lệ/i)).not.toBeInTheDocument();
    // 3. Preview button must be disabled because m-gddp-10 is not a valid member
    expect(screen.getByRole('button', { name: /Xem trước thay đổi quyền/i })).toBeDisabled();
  });

  it('coordinator UX C2-ANTI-POLLUTION: switching academic year does not leak old year options into new scope', async () => {
    let year2025Resolver: ((val: Response) => void) | null = null;
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
      if (url.includes('/api/capabilities/responsibility-templates/academic-year-options')) {
        return jsonResponse({
          items: [
            { id: 'year-2026', code: '2026_2027', name: 'Năm học 2026-2027' },
            { id: 'year-2025', code: '2025_2026', name: 'Năm học 2025-2026' },
          ],
          total: 2,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        });
      }
      if (url.includes('/api/capabilities/responsibility-templates/programme-master-options')) {
        const urlObj = new URL(url, 'http://localhost');
        const yearId = urlObj.searchParams.get('academicYearId');
        if (yearId === 'year-2026') {
          return jsonResponse({
            items: [{ id: 'm-2026-10', academicYearId: 'year-2026', kind: 'GDDP', gradeLevel: 10 }],
            total: 1,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          });
        }
        if (yearId === 'year-2025') {
          return new Promise<Response>((resolve) => {
            year2025Resolver = resolve;
          });
        }
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
    await user.click(await screen.findByRole('button', { name: 'Chọn gv_nguyenvanb' }));

    const templateSelect = await screen.findByLabelText(/Chọn Mẫu trách nhiệm/i);
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    const yearSelect = await screen.findByLabelText(/Chọn năm học cho mẫu điều phối/i);
    await user.selectOptions(yearSelect, 'year-2026');

    // Master of year-2026 loads
    await screen.findByLabelText(/Chọn chương trình đào tạo cho mẫu điều phối/i);
    expect(await screen.findByRole('option', { name: /Khối 10/i })).toBeInTheDocument();

    // Now switch to year-2025
    await user.selectOptions(yearSelect, 'year-2025');

    // While year-2025 query is pending, old master m-2026-10 must NOT appear under year-2025
    expect(screen.queryByRole('option', { name: /Khối 10/i })).not.toBeInTheDocument();

    // Resolve year-2025 with its own master
    act(() => {
      if (year2025Resolver) {
        year2025Resolver(
          jsonResponse({
            items: [{ id: 'm-2025-12', academicYearId: 'year-2025', kind: 'GDDP', gradeLevel: 12 }],
            total: 1,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          }),
        );
      }
    });

    // Now only year-2025 master appears
    expect(await screen.findByRole('option', { name: /Khối 12/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Khối 10/i })).not.toBeInTheDocument();
  });

  it('coordinator UX C2-ANTI-STALE: switching academic year or template key clears old preview snapshot and disables Apply', async () => {
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
      if (url.includes('/api/capabilities/responsibility-templates/academic-year-options')) {
        return jsonResponse({
          items: [
            { id: 'year-2026', code: '2026_2027', name: 'Năm học 2026-2027' },
            { id: 'year-2025', code: '2025_2026', name: 'Năm học 2025-2026' },
          ],
          total: 2,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        });
      }
      if (url.includes('/api/capabilities/responsibility-templates/programme-master-options')) {
        const urlObj = new URL(url, 'http://localhost');
        const yearId = urlObj.searchParams.get('academicYearId');
        if (yearId === 'year-2026') {
          return jsonResponse({
            items: [{ id: 'm-2026-10', academicYearId: 'year-2026', kind: 'GDDP', gradeLevel: 10 }],
            total: 1,
            page: 1,
            pageSize: 50,
            totalPages: 1,
          });
        }
        return jsonResponse({
          items: [{ id: 'm-2025-10', academicYearId: 'year-2025', kind: 'GDDP', gradeLevel: 10 }],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        });
      }
      if (url.includes('/api/capabilities/responsibility-templates')) {
        return jsonResponse({ items: mockTemplates });
      }
      if (url.includes('/api/users/u-teacher-1/responsibility-templates/preview') && init?.method === 'POST') {
        return jsonResponse({
          templateKey: 'GDDP_COORDINATOR',
          version: 'v1',
          targetUser: { id: 'u-teacher-1', username: 'gv_nguyenvanb', displayName: 'Nguyễn Văn Bình', isTeachingStaff: true, status: 'ACTIVE' },
          eligibility: { isEligible: true },
          requiredResources: { kind: 'ACTIVITY', provided: true, resolvedProgrammeMasterId: 'm-2026-10', details: 'GDĐP (Khối 10)' },
          grantsToAdd: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: 'm-2026-10', description: 'Điều phối' }],
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
    await user.selectOptions(templateSelect, 'GDDP_COORDINATOR');

    const yearSelect = await screen.findByLabelText(/Chọn năm học cho mẫu điều phối/i);
    await user.selectOptions(yearSelect, 'year-2026');

    const masterSelect = await screen.findByLabelText(/Chọn chương trình đào tạo cho mẫu điều phối/i);
    await user.selectOptions(masterSelect, 'm-2026-10');

    const previewBtn = screen.getByRole('button', { name: /Xem trước thay đổi quyền/i });
    await user.click(previewBtn);

    expect(await screen.findByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).toBeInTheDocument();

    // Now switch academic year to year-2025
    await user.selectOptions(yearSelect, 'year-2025');

    // Apply button is removed immediately; programmeMaster is reset
    expect(screen.queryByRole('button', { name: /Áp dụng Mẫu trách nhiệm/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xem trước thay đổi quyền/i })).toBeDisabled();
  });
});
