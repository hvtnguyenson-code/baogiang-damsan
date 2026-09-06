import type {
  BusinessPolicyFamilyMetadata,
  BusinessPolicyResolution,
  BusinessPolicyStreamRecord,
  CapabilityKey,
  CapabilityScope,
} from '@baogiang/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BusinessPolicyUiAdapter } from '../lib/business-policy-ui-registry';
import { BusinessConfigurationPage } from '../pages/BusinessConfigurationPage';
import { jsonResponse, normalAuth, renderApp, renderWithQuery } from './test-utils';

function authWith(key?: CapabilityKey, scope: CapabilityScope = 'SCHOOL_WIDE', resourceId?: string) {
  return {
    ...normalAuth,
    capabilities: key ? [{ key, scope, ...(resourceId ? { resourceId } : {}) }] : [],
  };
}

type CapturedCommandBody = Record<string, unknown> & { commandId?: string };

const TEST_BOOLEAN_THRESHOLD_ADAPTER: BusinessPolicyUiAdapter<{ enabled: boolean; threshold: number }> = {
  familyKey: 'TEST_BOOLEAN_THRESHOLD',
  displayName: 'Chính sách ngưỡng kiểm thử',
  description: 'Chính sách mẫu kiểm thử có bật/tắt và ngưỡng số',
  resourceKind: 'SCHOOL_WIDE',
  initialPayload: () => ({ enabled: true, threshold: 10 }),
  validatePayload: (value) => {
    if (!value || typeof value !== 'object') return { valid: false, error: 'Dữ liệu không hợp lệ.' };
    const cand = value as { enabled?: unknown; threshold?: unknown };
    if (typeof cand.enabled !== 'boolean') return { valid: false, error: 'enabled phải là boolean.' };
    if (typeof cand.threshold !== 'number' || Number.isNaN(cand.threshold)) return { valid: false, error: 'threshold phải là số.' };
    return { valid: true, payload: { enabled: cand.enabled, threshold: cand.threshold } };
  },
  EditorComponent: ({ value, onChange, disabled }) => (
    <div data-testid="test-adapter-editor">
      <label>
        <input
          type="checkbox"
          aria-label="Kích hoạt ngưỡng"
          checked={Boolean(value.enabled)}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Kích hoạt ngưỡng
      </label>
      <label>
        Ngưỡng tối thiểu
        <input
          type="number"
          aria-label="Ngưỡng tối thiểu"
          value={typeof value.threshold === 'number' ? value.threshold : 0}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, threshold: Number(e.target.value) })}
        />
      </label>
    </div>
  ),
  SummaryComponent: ({ payload }) => (
    <div data-testid="test-adapter-summary">
      <p>Trạng thái: {payload.enabled ? 'Đang bật' : 'Đang tắt'}</p>
      <p>Ngưỡng: {String(payload.threshold)}</p>
    </div>
  ),
};

describe('P1-022 Business Configuration administration workspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 1. Navigation link visible with exact capability
  it('shows navigation link "Chính sách nghiệp vụ" when user has BUSINESS_CONFIGURATION_MANAGE / SCHOOL_WIDE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith('BUSINESS_CONFIGURATION_MANAGE'))));
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: 'Chính sách nghiệp vụ' })).length).toBeGreaterThanOrEqual(1);
  });

  // 2. Navigation link hidden without capability
  it('hides navigation link when user lacks BUSINESS_CONFIGURATION_MANAGE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(normalAuth)));
    renderApp('/');
    await screen.findByRole('heading', { name: /chào/i });
    expect(screen.queryByRole('link', { name: 'Chính sách nghiệp vụ' })).not.toBeInTheDocument();
  });

  // 3. Navigation link hidden for SYSTEM_ADMIN alone
  it('does not derive business configuration navigation from SYSTEM_ADMIN alone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith('SYSTEM_ADMIN'))));
    renderApp('/');
    await screen.findByRole('heading', { name: /chào/i });
    expect(screen.queryByRole('link', { name: 'Chính sách nghiệp vụ' })).not.toBeInTheDocument();
  });

  // 4. Direct route denied without capability
  it('denies direct access to /quan-tri/chinh-sach-nghiep-vu without exact capability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(authWith('ACADEMIC_STRUCTURE_MANAGE'))));
    renderApp('/quan-tri/chinh-sach-nghiep-vu');
    expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chính sách nghiệp vụ' })).not.toBeInTheDocument();
  });

  // 5. Empty families registry renders approved empty state
  it('renders approved-family empty state when backend families list is empty', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse([]);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage />);
    expect(await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' })).toBeInTheDocument();
    expect(
      screen.getByText('Chưa có nhóm chính sách nghiệp vụ nào được phê duyệt và kích hoạt.'),
    ).toBeInTheDocument();
  });

  // 6. Empty registry provides no create button or form
  it('provides no create button or form when families registry is empty', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse([]);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage />);
    await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' });
    expect(screen.queryByRole('button', { name: /tạo bản nháp/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ngày bắt đầu hiệu lực/i)).not.toBeInTheDocument();
  });

  // 7. No raw JSON textarea or arbitrary key/value inputs exist on page
  it('contains no raw JSON textarea or arbitrary key/value inputs in the workspace', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse([]);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = renderWithQuery(<BusinessConfigurationPage />);
    await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' });
    expect(container.querySelector('textarea[name="json"]')).not.toBeInTheDocument();
    expect(container.querySelector('textarea[name="payload"]')).not.toBeInTheDocument();
  });

  // 8. Backend family without UI adapter fails closed (no mutation UI)
  it('fails closed when backend family has no matching UI adapter', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'UNSUPPORTED_FAMILY',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[]} />);
    await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' });
    expect(screen.getAllByText('UNSUPPORTED_FAMILY').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText('Nhóm chính sách này chưa có giao diện quản trị đã được phê duyệt.').length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Tạo bản nháp' })).not.toBeInTheDocument();
  });

  // 9. Publication-disabled family does not allow create draft
  it('blocks draft creation when family has publicationEnabled === false', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: false,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />,
    );
    await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' });
    expect(screen.getByText('Tạm dừng công bố')).toBeInTheDocument();
    expect(screen.getByText('Nhóm chính sách này hiện đang tạm dừng công bố.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạo bản nháp' })).not.toBeInTheDocument();
  });

  // 10. Resource-kind mismatch fails closed
  it('fails closed when adapter resourceKind mismatches backend family resourceKind', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'ACADEMIC_YEAR', // Mismatch: adapter expects SCHOOL_WIDE
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />,
    );
    await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' });
    expect(
      screen.getByText('Phạm vi tài nguyên của giao diện không khớp với định nghĩa hệ thống.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạo bản nháp' })).not.toBeInTheDocument();
  });

  // 11 & 12. Eligible family with test adapter renders checkbox/number input and submits typed draft
  it('renders typed inputs (checkbox & number) and posts valid draft DTO with commandId', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    let createdBody: CapturedCommandBody | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/drafts') && init?.method === 'POST') {
        createdBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return jsonResponse({ outcome: 'CREATED', streamId: 'stream-1', versionId: 'ver-1' });
      }
      if (url.includes('/business-configuration/policies/stream-1')) {
        return jsonResponse({
          id: 'stream-1',
          familyKey: 'TEST_BOOLEAN_THRESHOLD',
          resourceKind: 'SCHOOL_WIDE',
          academicYearId: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          versions: [
            {
              id: 'ver-1',
              streamId: 'stream-1',
              versionNumber: 1,
              status: 'DRAFT',
              payload: { enabled: true, threshold: 25 },
              validatorVersion: '1.0.0',
              effectiveFrom: '2026-09-05',
              effectiveUntil: null,
              draftRevision: 0,
              reversedAt: null,
              correctionReason: null,
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/business-configuration/policies')) {
        return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />,
    );
    const createBtn = await screen.findByRole('button', { name: 'Tạo bản nháp' });
    fireEvent.click(createBtn);

    // Verify form rendered
    expect(screen.getByRole('heading', { name: 'Tạo bản nháp chính sách nghiệp vụ' })).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: 'Kích hoạt ngưỡng' });
    const numberInput = screen.getByRole('spinbutton', { name: 'Ngưỡng tối thiểu' });
    expect(checkbox).toBeInTheDocument();
    expect(numberInput).toBeInTheDocument();

    // Fill in dates and values
    fireEvent.change(screen.getByLabelText(/ngày bắt đầu hiệu lực/i), {
      target: { value: '2026-09-05' },
    });
    fireEvent.change(numberInput, { target: { value: '25' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    await waitFor(() => expect(createdBody).not.toBeNull());
    expect(createdBody).toMatchObject({
      family: 'TEST_BOOLEAN_THRESHOLD',
      resource: { kind: 'SCHOOL_WIDE' },
      payload: { enabled: true, threshold: 25 },
      effectiveFrom: '2026-09-05',
    });
    expect(typeof (createdBody as CapturedCommandBody | null)?.commandId).toBe('string');
  });

  // 13. Unknown fields not present in payload
  it('ensures unknown fields are not added to typed payload', async () => {
    const val = TEST_BOOLEAN_THRESHOLD_ADAPTER.validatePayload({
      enabled: false,
      threshold: 50,
      unknownProp: 'malicious',
    });
    expect(val.valid).toBe(true);
    if (val.valid) {
      expect((val.payload as Record<string, unknown>).unknownProp).toBeUndefined();
    }
  });

  // 14 & 16. Edit draft preserves optimistic concurrency expectedRevision and handles 409
  it('sends expectedRevision on draft edit and surfaces 409 conflict error', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-1',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        {
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'DRAFT',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
          draftRevision: 3,
          reversedAt: null,
          correctionReason: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    };

    let editBody: CapturedCommandBody | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-1')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      if (url.includes('/business-configuration/policy-versions/ver-1/edit-draft') && init?.method === 'POST') {
        editBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return jsonResponse({ statusCode: 409, message: 'BUSINESS_POLICY_CONFLICT' }, 409);
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />,
    );
    // Open stream detail
    const viewBtn = await screen.findByRole('button', { name: 'Xem lịch sử' });
    fireEvent.click(viewBtn);

    // Click edit draft
    const editBtn = await screen.findByRole('button', { name: 'Chỉnh sửa bản nháp' });
    fireEvent.click(editBtn);

    expect(screen.getByRole('heading', { name: 'Chỉnh sửa bản nháp chính sách' })).toBeInTheDocument();
    expect(screen.getByText(/lần sửa đổi hiện tại: 3/i)).toBeInTheDocument();

    // Save changes
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(editBody).not.toBeNull());
    expect(editBody).toMatchObject({
      expectedRevision: 3,
      payload: { enabled: true, threshold: 10 },
    });
    expect(typeof (editBody as CapturedCommandBody | null)?.commandId).toBe('string');

    // Conflict error surfaced
    expect(await screen.findByText(/xung đột dữ liệu hoặc trạng thái chính sách không cho phép/i)).toBeInTheDocument();
  });

  // 15. Publish action confirms and publishes
  it('prompts confirmation and posts publish mutation with commandId', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-1',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        {
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'DRAFT',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
          draftRevision: 0,
          reversedAt: null,
          correctionReason: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    };

    let publishCalled = false;
    let publishBody: CapturedCommandBody | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-1')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      if (url.includes('/business-configuration/policy-versions/ver-1/publish') && init?.method === 'POST') {
        publishCalled = true;
        publishBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return jsonResponse({ outcome: 'PUBLISHED', versionId: 'ver-1' });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Công bố' }));

    expect(screen.getByRole('heading', { name: 'Xác nhận công bố chính sách nghiệp vụ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Công bố chính thức' }));

    await waitFor(() => expect(publishCalled).toBe(true));
    expect(typeof (publishBody as CapturedCommandBody | null)?.commandId).toBe('string');
  });

  // 17. Future replacement workflow
  it('allows future replacement for open-ended PUBLISHED version', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-1',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        {
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'PUBLISHED',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
          draftRevision: 0,
          reversedAt: null,
          correctionReason: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    };

    let replaceBody: CapturedCommandBody | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-1')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      if (url.includes('/business-configuration/policy-versions/ver-1/replace') && init?.method === 'POST') {
        replaceBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return jsonResponse({ outcome: 'REPLACED', versionId: 'ver-2' });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Thay đổi trong tương lai' }));

    expect(screen.getByRole('heading', { name: 'Thay đổi chính sách trong tương lai' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/ngày bắt đầu hiệu lực mới/i), {
      target: { value: '2026-10-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thay thế' }));

    await waitFor(() => expect(replaceBody).not.toBeNull());
    expect(replaceBody).toMatchObject({
      effectiveFrom: '2026-10-01',
      payload: { enabled: true, threshold: 10 },
    });
    expect(typeof (replaceBody as CapturedCommandBody | null)?.commandId).toBe('string');
  });

  // 18. Retire workflow
  it('allows retiring an open-ended PUBLISHED version with effectiveUntil date', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-1',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        {
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'PUBLISHED',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
          draftRevision: 0,
          reversedAt: null,
          correctionReason: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    };

    let retireBody: CapturedCommandBody | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-1')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      if (url.includes('/business-configuration/policy-versions/ver-1/retire') && init?.method === 'POST') {
        retireBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return jsonResponse({ outcome: 'RETIRED', versionId: 'ver-1' });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kết thúc hiệu lực' }));

    expect(screen.getByRole('heading', { name: 'Kết thúc hiệu lực chính sách' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/ngày kết thúc hiệu lực/i), {
      target: { value: '2026-09-30' },
    });
    fireEvent.change(screen.getByLabelText(/lý do kết thúc/i), {
      target: { value: 'Kết thúc chu kỳ năm học' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kết thúc' }));

    await waitFor(() => expect(retireBody).not.toBeNull());
    expect(retireBody).toMatchObject({
      effectiveUntil: '2026-09-30',
      reason: 'Kết thúc chu kỳ năm học',
    });
    expect(typeof (retireBody as CapturedCommandBody | null)?.commandId).toBe('string');
  });

  // 19 & 20. Correction workflow requires reason and posts correct DTO
  it('blocks correction submission when reason is blank and submits correct DTO with valid reason', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-1',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        {
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'PUBLISHED',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
          draftRevision: 0,
          reversedAt: null,
          correctionReason: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    };

    let correctBody: CapturedCommandBody | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-1')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      if (url.includes('/business-configuration/policy-versions/ver-1/correct') && init?.method === 'POST') {
        correctBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return jsonResponse({ outcome: 'CORRECTED', versionId: 'ver-2' });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa sai lịch sử' }));

    expect(screen.getByRole('heading', { name: 'Sửa sai lịch sử chính sách nghiệp vụ' })).toBeInTheDocument();

    // Try submitting with whitespace reason
    const reasonInput = screen.getByLabelText(/lý do sửa sai lịch sử/i);
    fireEvent.change(reasonInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận sửa sai' }));

    expect(await screen.findByText('Bắt buộc phải nhập lý do khi thực hiện sửa sai lịch sử.')).toBeInTheDocument();
    expect(correctBody).toBeNull();

    // Enter valid reason and submit
    fireEvent.change(reasonInput, { target: { value: 'Nhầm lẫn ngưỡng theo quyết định 123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận sửa sai' }));

    await waitFor(() => expect(correctBody).not.toBeNull());
    expect(correctBody).toMatchObject({
      reason: 'Nhầm lẫn ngưỡng theo quyết định 123',
      payload: { enabled: true, threshold: 10 },
      effectiveFrom: '2026-09-01',
    });
    expect(typeof (correctBody as CapturedCommandBody | null)?.commandId).toBe('string');
  });

  // 21, 22, 23, 24. Lineage display and REVERSED read-only behavior
  it('displays replacement and correction lineage clearly, and ensures REVERSED versions are read-only', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-1',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        {
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'REVERSED',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
          draftRevision: 0,
          reversedAt: '2026-09-02T10:30:00.000Z',
          correctionReason: 'Sai ngưỡng ban đầu',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-02T10:30:00.000Z',
        },
        {
          id: 'ver-2',
          streamId: 'stream-1',
          versionNumber: 2,
          status: 'PUBLISHED',
          payload: { enabled: true, threshold: 20 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
          draftRevision: 0,
          reversedAt: null,
          correctionReason: null,
          correctsVersionId: 'ver-1',
          replacesVersionId: null,
          createdAt: '2026-09-02T10:30:00.000Z',
          updatedAt: '2026-09-02T10:30:00.000Z',
        },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-1')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));

    // Verify REVERSED label and evidence asynchronously as stream loads
    expect(await screen.findByText(/lý do sửa sai: sai ngưỡng ban đầu/i)).toBeInTheDocument();
    expect(screen.getAllByText('Đã đảo ngược (sửa sai)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/bản ghi chỉ đọc \(đã sửa sai\)/i)).toBeInTheDocument();

    // Verify correctsVersionId lineage on version 2
    expect(screen.getByText(/hiệu chỉnh cho phiên bản id:/i)).toBeInTheDocument();
  });

  // 25, 26, 27, 28, 29. Exact-date resolution lookup tool
  it('performs exact-date policy resolution lookup and displays typed outcomes', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];

    let requestedUrl = '';
    const resolutionSuccess: BusinessPolicyResolution = {
      outcome: 'RESOLVED',
      family: 'TEST_BOOLEAN_THRESHOLD',
      resource: { kind: 'SCHOOL_WIDE' },
      requestedCivilDate: '2026-09-15',
      policyVersionId: 'ver-1',
      validatorVersion: '1.0.0',
      effectiveFrom: '2026-09-01',
      effectiveUntil: null,
      payload: { enabled: true, threshold: 15 },
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      if (url.includes('/business-configuration/resolve')) {
        requestedUrl = url;
        return jsonResponse(resolutionSuccess);
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />,
    );
    await screen.findByRole('heading', { name: 'Kiểm tra chính sách theo ngày' });

    // Select family and enter explicit civil date
    fireEvent.change(screen.getByRole('combobox', { name: 'Nhóm chính sách' }), {
      target: { value: 'TEST_BOOLEAN_THRESHOLD' },
    });
    fireEvent.change(screen.getByLabelText(/ngày dân sự cần tra cứu/i), {
      target: { value: '2026-09-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));

    await waitFor(() => expect(requestedUrl).toContain('civilDate=2026-09-15'));
    expect(requestedUrl).toContain('family=TEST_BOOLEAN_THRESHOLD');
    expect(requestedUrl).toContain('kind=SCHOOL_WIDE');

    // Display RESOLVED outcome with typed summary
    expect(await screen.findByText(/kết quả tra cứu: RESOLVED/i)).toBeInTheDocument();
    expect(screen.getByText(/tìm thấy chính sách có hiệu lực/i)).toBeInTheDocument();
    expect(screen.getByTestId('test-adapter-summary')).toBeInTheDocument();
    expect(screen.getByText('Ngưỡng: 15')).toBeInTheDocument();
  });

  it('displays correct warning state when resolution returns POLICY_NOT_CONFIGURED', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      if (url.includes('/business-configuration/resolve')) {
        return jsonResponse({
          outcome: 'POLICY_NOT_CONFIGURED',
          family: 'TEST_BOOLEAN_THRESHOLD',
          resource: { kind: 'SCHOOL_WIDE' },
          requestedCivilDate: '2026-08-15',
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Nhóm chính sách' }), {
      target: { value: 'TEST_BOOLEAN_THRESHOLD' },
    });
    fireEvent.change(screen.getByLabelText(/ngày dân sự cần tra cứu/i), {
      target: { value: '2026-08-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));

    expect(await screen.findByText(/chưa có chính sách nào được cấu hình cho phạm vi và ngày dân sự này/i)).toBeInTheDocument();
  });

  it('displays incident alert when resolution returns POLICY_AMBIGUOUS or POLICY_CORRUPT', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      if (url.includes('/business-configuration/resolve')) {
        return jsonResponse({
          outcome: 'POLICY_AMBIGUOUS',
          family: 'TEST_BOOLEAN_THRESHOLD',
          resource: { kind: 'SCHOOL_WIDE' },
          requestedCivilDate: '2026-09-15',
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Nhóm chính sách' }), {
      target: { value: 'TEST_BOOLEAN_THRESHOLD' },
    });
    fireEvent.change(screen.getByLabelText(/ngày dân sự cần tra cứu/i), {
      target: { value: '2026-09-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));

    expect(
      await screen.findByRole('heading', { name: /kết quả tra cứu:\s*POLICY_AMBIGUOUS/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sự cố tính toàn vẹn: tồn tại nhiều hơn một chính sách cùng có hiệu lực/i),
    ).toBeInTheDocument();
  });

  it('strictly contains no browser clock authority (Date.now or new Date) for civil dates', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const pageSource = fs.readFileSync(path.resolve(__dirname, '../pages/BusinessConfigurationPage.tsx'), 'utf-8');
    const apiSource = fs.readFileSync(path.resolve(__dirname, '../lib/business-configuration-api.ts'), 'utf-8');
    expect(pageSource).not.toMatch(/new\s+Date\s*\(/);
    expect(pageSource).not.toMatch(/Date\.now\s*\(/);
    expect(apiSource).not.toMatch(/new\s+Date\s*\(/);
    expect(apiSource).not.toMatch(/Date\.now\s*\(/);
  });

  // 31. Absence of adapter for stream payload does NOT dump raw json
  it('does not raw-dump JSON when UI adapter is absent for retained stream versions', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'UNKNOWN_FAMILY',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: false,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-unknown',
      familyKey: 'UNKNOWN_FAMILY',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        {
          id: 'ver-u',
          streamId: 'stream-unknown',
          versionNumber: 1,
          status: 'PUBLISHED',
          payload: { secretCode: 'SECRET_PAYLOAD_VALUE_XYZ' },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01',
          effectiveUntil: null,
          draftRevision: 0,
          reversedAt: null,
          correctionReason: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-unknown')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));

    expect(
      await screen.findByText(/không thể hiển thị nội dung chi tiết vì nhóm chính sách chưa có giao diện/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/SECRET_PAYLOAD_VALUE_XYZ/)).not.toBeInTheDocument();
  });

  // 32. Technical exclusion verification
  it('verifies no technical infrastructure configurations or SystemSetting keys are exposed', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse([]);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = renderWithQuery(<BusinessConfigurationPage />);
    await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' });

    const forbiddenTerms = [
      'DATABASE_URL',
      'POSTGRES_PASSWORD',
      'TELEGRAM_BOT_TOKEN',
      'SESSION_SECRET',
      'SYSTEM_SETTING',
      'NGINX_PORT',
    ];
    forbiddenTerms.forEach((term) => {
      expect(container.textContent).not.toContain(term);
    });
  });
});
