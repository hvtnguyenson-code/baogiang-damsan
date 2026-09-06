import type {
  BusinessPolicyFamilyMetadata,
  BusinessPolicyResolution,
  BusinessPolicyStreamRecord,
  BusinessPolicyVersionRecord,
  CapabilityKey,
  CapabilityScope,
} from '@baogiang/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidCivilDate } from '../lib/business-configuration-api';
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

const EXACT_TEST_ACADEMIC_YEAR_ID = '33333333-3333-3333-3333-333333333333';

const TEST_BOOLEAN_THRESHOLD_ADAPTER: BusinessPolicyUiAdapter<{ enabled: boolean; threshold: number }> = {
  familyKey: 'TEST_BOOLEAN_THRESHOLD',
  validatorVersion: '1.0.0',
  displayName: 'Chính sách ngưỡng kiểm thử v1',
  description: 'Chính sách mẫu kiểm thử có bật/tắt và ngưỡng số v1',
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

const TEST_BOOLEAN_THRESHOLD_V2_ADAPTER: BusinessPolicyUiAdapter<{ enabled: boolean; threshold: number }> = {
  familyKey: 'TEST_BOOLEAN_THRESHOLD',
  validatorVersion: '2.0.0',
  displayName: 'Chính sách ngưỡng kiểm thử v2',
  description: 'Chính sách mẫu kiểm thử v2',
  resourceKind: 'SCHOOL_WIDE',
  initialPayload: () => ({ enabled: true, threshold: 25 }),
  validatePayload: (value) => {
    if (!value || typeof value !== 'object') return { valid: false, error: 'Dữ liệu không hợp lệ.' };
    const cand = value as { enabled?: unknown; threshold?: unknown };
    if (typeof cand.enabled !== 'boolean') return { valid: false, error: 'enabled phải là boolean.' };
    if (typeof cand.threshold !== 'number' || Number.isNaN(cand.threshold)) return { valid: false, error: 'threshold phải là số.' };
    return { valid: true, payload: { enabled: cand.enabled, threshold: cand.threshold } };
  },
  EditorComponent: ({ value, onChange, disabled }) => (
    <div data-testid="test-adapter-editor-v2">
      <label>
        <input
          type="checkbox"
          aria-label="Kích hoạt ngưỡng v2"
          checked={Boolean(value.enabled)}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        Kích hoạt ngưỡng v2
      </label>
      <label>
        Ngưỡng tối thiểu v2
        <input
          type="number"
          aria-label="Ngưỡng tối thiểu v2"
          value={typeof value.threshold === 'number' ? value.threshold : 0}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, threshold: Number(e.target.value) })}
        />
      </label>
    </div>
  ),
  SummaryComponent: ({ payload }) => (
    <div data-testid="test-adapter-summary-v2">
      <p>V2 Trạng thái: {payload.enabled ? 'Đang bật' : 'Đang tắt'}</p>
      <p>V2 Ngưỡng: {String(payload.threshold)}</p>
    </div>
  ),
};

const TEST_ACADEMIC_YEAR_CONFIG_ADAPTER: BusinessPolicyUiAdapter<{ maxCredits: number }> = {
  familyKey: 'TEST_ACADEMIC_YEAR_CONFIG',
  validatorVersion: '1.0.0',
  displayName: 'Cấu hình năm học mẫu',
  description: 'Chính sách năm học mẫu cho web test',
  resourceKind: 'ACADEMIC_YEAR',
  initialPayload: () => ({ maxCredits: 30 }),
  validatePayload: (value) => {
    if (!value || typeof value !== 'object') return { valid: false, error: 'Dữ liệu không hợp lệ.' };
    const cand = value as { maxCredits?: unknown };
    if (typeof cand.maxCredits !== 'number' || Number.isNaN(cand.maxCredits)) return { valid: false, error: 'maxCredits phải là số.' };
    return { valid: true, payload: { maxCredits: cand.maxCredits } };
  },
  ResourceEditorComponent: ({ resource, onChange, disabled }) => (
    <div data-testid="test-academic-year-resource-picker">
      <label>
        Năm học áp dụng
        <select
          aria-label="Chọn năm học áp dụng"
          value={resource.kind === 'ACADEMIC_YEAR' ? resource.academicYearId : ''}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              kind: 'ACADEMIC_YEAR',
              academicYearId: e.target.value,
            })
          }
        >
          <option value="">-- Chọn năm học --</option>
          <option value={EXACT_TEST_ACADEMIC_YEAR_ID}>Năm học 2026-2027</option>
        </select>
      </label>
    </div>
  ),
  EditorComponent: ({ value, onChange, disabled }) => (
    <div data-testid="test-ay-editor">
      <label>
        Tín chỉ tối đa
        <input
          type="number"
          aria-label="Tín chỉ tối đa"
          value={typeof value.maxCredits === 'number' ? value.maxCredits : 0}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, maxCredits: Number(e.target.value) })}
        />
      </label>
    </div>
  ),
  SummaryComponent: ({ payload }) => (
    <div data-testid="test-ay-summary">
      <p>Tín chỉ tối đa: {String(payload.maxCredits)}</p>
    </div>
  ),
};

function makeMockVersion(overrides: Partial<BusinessPolicyVersionRecord> = {}): BusinessPolicyVersionRecord {
  return {
    id: overrides.id ?? 'ver-1',
    streamId: overrides.streamId ?? 'stream-1',
    versionNumber: overrides.versionNumber ?? 1,
    status: overrides.status ?? 'PUBLISHED',
    payload: overrides.payload ?? { enabled: true, threshold: 10 },
    validatorVersion: overrides.validatorVersion ?? '1.0.0',
    effectiveFrom: overrides.effectiveFrom ?? '2026-09-05T00:00:00.000Z',
    effectiveUntil: overrides.effectiveUntil ?? null,
    draftRevision: overrides.draftRevision ?? 1,
    createdByUserId: overrides.createdByUserId ?? '11111111-1111-1111-1111-111111111111',
    publishedByUserId: overrides.publishedByUserId !== undefined ? overrides.publishedByUserId : (overrides.status === 'DRAFT' ? null : '22222222-2222-2222-2222-222222222222'),
    publishedAt: overrides.publishedAt !== undefined ? overrides.publishedAt : (overrides.status === 'DRAFT' ? null : '2026-09-05T08:00:00.000Z'),
    reversedByUserId: overrides.reversedByUserId ?? null,
    reversedAt: overrides.reversedAt ?? null,
    correctionReason: overrides.correctionReason ?? null,
    replacesVersionId: overrides.replacesVersionId ?? null,
    correctsVersionId: overrides.correctsVersionId ?? null,
    createdAt: overrides.createdAt ?? '2026-09-05T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-05T08:00:00.000Z',
  };
}

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
        resourceKind: 'ACADEMIC_YEAR',
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
            makeMockVersion({
              id: 'ver-1',
              streamId: 'stream-1',
              status: 'DRAFT',
              payload: { enabled: true, threshold: 25 },
              effectiveFrom: '2026-09-05T00:00:00.000Z',
            }),
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

    expect(screen.getByRole('heading', { name: 'Tạo bản nháp chính sách nghiệp vụ' })).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: 'Kích hoạt ngưỡng' });
    const numberInput = screen.getByRole('spinbutton', { name: 'Ngưỡng tối thiểu' });
    expect(checkbox).toBeInTheDocument();
    expect(numberInput).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ngày bắt đầu hiệu lực/i), {
      target: { value: '2026-09-05' },
    });
    fireEvent.change(numberInput, { target: { value: '25' } });

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
        makeMockVersion({
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'DRAFT',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          draftRevision: 3,
        }),
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
    const viewBtn = await screen.findByRole('button', { name: 'Xem lịch sử' });
    fireEvent.click(viewBtn);

    const editBtn = await screen.findByRole('button', { name: 'Chỉnh sửa bản nháp' });
    fireEvent.click(editBtn);

    expect(screen.getByRole('heading', { name: 'Chỉnh sửa bản nháp chính sách' })).toBeInTheDocument();
    expect(screen.getByText(/lần sửa đổi hiện tại: 3/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(editBody).not.toBeNull());
    expect(editBody).toMatchObject({
      expectedRevision: 3,
      payload: { enabled: true, threshold: 10 },
    });
    expect(typeof (editBody as CapturedCommandBody | null)?.commandId).toBe('string');

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
        makeMockVersion({
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'DRAFT',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01T00:00:00.000Z',
        }),
      ],
    };

    let publishCalled = false;
    let publishCommandId: string | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-1')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      if (url.includes('/business-configuration/policy-versions/ver-1/publish') && init?.method === 'POST') {
        publishCalled = true;
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        publishCommandId = body.commandId as string;
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
    expect(typeof publishCommandId).toBe('string');
    expect(await screen.findByText('Đã công bố chính sách nghiệp vụ thành công.')).toBeInTheDocument();
  });

  // 17. Replace action posts with commandId
  it('replaces an open-ended published version and provides commandId', async () => {
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
        makeMockVersion({
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'PUBLISHED',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          effectiveUntil: null,
        }),
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

  // 18. Retire action posts effectiveUntil and optional reason
  it('retires an open-ended published version with reason and commandId', async () => {
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
        makeMockVersion({
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'PUBLISHED',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          effectiveUntil: null,
        }),
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

    fireEvent.change(screen.getByLabelText(/ngày kết thúc hiệu lực/i), {
      target: { value: '2026-09-30' },
    });
    fireEvent.change(screen.getByLabelText(/lý do kết thúc/i), {
      target: { value: 'Hết kỳ hạn áp dụng theo nghị quyết mới' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kết thúc' }));

    await waitFor(() => expect(retireBody).not.toBeNull());
    expect(retireBody).toMatchObject({
      effectiveUntil: '2026-09-30',
      reason: 'Hết kỳ hạn áp dụng theo nghị quyết mới',
    });
    expect(typeof (retireBody as CapturedCommandBody | null)?.commandId).toBe('string');
  });

  // 19. Correct action requires reason and creates correction
  it('requires reason when correcting historical published version', async () => {
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
        makeMockVersion({
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'PUBLISHED',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          effectiveUntil: null,
        }),
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
    fireEvent.change(screen.getByLabelText(/lý do sửa sai lịch sử/i), {
      target: { value: 'Sửa sai ngưỡng áp dụng do nhầm lẫn biên bản hội đồng' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận sửa sai' }));

    await waitFor(() => expect(correctBody).not.toBeNull());
    expect(correctBody).toMatchObject({
      reason: 'Sửa sai ngưỡng áp dụng do nhầm lẫn biên bản hội đồng',
      payload: { enabled: true, threshold: 10 },
    });
    expect(typeof (correctBody as CapturedCommandBody | null)?.commandId).toBe('string');
  });

  // 20. Reversed versions are strictly read-only
  it('renders reversed versions as read-only with reason and timestamp', async () => {
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
        makeMockVersion({
          id: 'ver-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'REVERSED',
          payload: { enabled: true, threshold: 10 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          effectiveUntil: null,
          reversedAt: '2026-09-02T10:00:00.000Z',
          reversedByUserId: '44444444-4444-4444-4444-444444444444',
          correctionReason: 'Sai sót biên bản',
        }),
        makeMockVersion({
          id: 'ver-2',
          streamId: 'stream-1',
          versionNumber: 2,
          status: 'PUBLISHED',
          payload: { enabled: true, threshold: 20 },
          validatorVersion: '1.0.0',
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          effectiveUntil: null,
          correctsVersionId: 'ver-1',
        }),
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

    expect(await screen.findByText('Bản ghi chỉ đọc (Đã sửa sai)')).toBeInTheDocument();
    expect(screen.getByText(/lý do sửa sai: Sai sót biên bản/i)).toBeInTheDocument();
    expect(screen.getByText('Đảo ngược:')).toBeInTheDocument();
    expect(screen.getByText('44444444-4444-4444-4444-444444444444')).toBeInTheDocument();
    expect(screen.getByText(/hiệu chỉnh cho phiên bản ID:/i)).toBeInTheDocument();
    expect(screen.getAllByText('ver-1').length).toBeGreaterThanOrEqual(1);
  });

  // 21. Exact-date resolution lookup
  it('calls resolvePolicy with explicit civilDate and renders typed summary', async () => {
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

    expect(await screen.findByText(/kết quả tra cứu: RESOLVED/i)).toBeInTheDocument();
    expect(screen.getByText(/tìm thấy chính sách có hiệu lực/i)).toBeInTheDocument();
    expect(screen.getByTestId('test-adapter-summary')).toBeInTheDocument();
    expect(screen.getByText('Ngưỡng: 15')).toBeInTheDocument();
  });

  // 22. Strict Civil Date Calendar Validation Tests
  it('strictly validates calendar dates using pure arithmetic without browser clock', () => {
    expect(isValidCivilDate('2026-02-30')).toBe(false);
    expect(isValidCivilDate('2025-02-29')).toBe(false);
    expect(isValidCivilDate('2026-04-31')).toBe(false);
    expect(isValidCivilDate('2026-00-10')).toBe(false);
    expect(isValidCivilDate('2026-13-10')).toBe(false);
    expect(isValidCivilDate('invalid-date')).toBe(false);

    expect(isValidCivilDate('2024-02-29')).toBe(true);
    expect(isValidCivilDate('2026-09-06')).toBe(true);
  });

  // 23. Realistic ISO Date wire fixtures normalized without timezone drift
  it('renders realistic ISO wire date strings (e.g. 2026-09-05T00:00:00.000Z) as 2026-09-05 without timezone drift', async () => {
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
      id: 'stream-iso',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-05T08:30:00.000Z',
      updatedAt: '2026-09-05T08:30:00.000Z',
      versions: [
        makeMockVersion({
          id: 'ver-iso',
          streamId: 'stream-iso',
          versionNumber: 1,
          status: 'PUBLISHED',
          effectiveFrom: '2026-09-05T00:00:00.000Z',
          effectiveUntil: '2027-05-31T00:00:00.000Z',
          createdAt: '2026-09-05T08:30:00.000Z',
          publishedAt: '2026-09-05T09:00:00.000Z',
          publishedByUserId: 'user-pub-uuid',
        }),
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-iso')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));

    // Verify stable ID loaded
    expect(await screen.findByText('ver-iso')).toBeInTheDocument();
    // Verify date normalized to 2026-09-05 and 2027-05-31 without timezone drift
    expect(screen.getAllByText('2026-09-05').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2027-05-31').length).toBeGreaterThanOrEqual(1);
    // Verify publisher evidence
    expect(screen.getByText('user-pub-uuid')).toBeInTheDocument();
  });

  // 24. Sanitizes unknown backend/Prisma errors
  it('masks raw SQLSTATE and Prisma error details with a safe generic message', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/drafts') && init?.method === 'POST') {
        return jsonResponse(
          {
            statusCode: 500,
            message: 'PrismaClientKnownRequestError: Unique constraint failed on (stream_id) [SQLSTATE 23505]',
          },
          500,
        );
      }
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo bản nháp' }));

    fireEvent.change(screen.getByLabelText(/ngày bắt đầu hiệu lực/i), { target: { value: '2026-09-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    expect(await screen.findByText('Yêu cầu không thực hiện được. Vui lòng tải lại dữ liệu và thử lại.')).toBeInTheDocument();
    expect(screen.queryByText(/PrismaClientKnownRequestError/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SQLSTATE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stream_id/)).not.toBeInTheDocument();
  });

  // 25. Independent read failure states for streamsQuery
  it('renders QueryFailure banner with retry on streamsQuery error and does NOT show empty state', async () => {
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
      if (url.includes('/business-configuration/policies')) {
        return jsonResponse({ statusCode: 500, message: 'Internal Server Error' }, 500);
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />);
    await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' });

    // Should render QueryFailure error inside streams section
    expect(await screen.findByRole('button', { name: /thử lại/i })).toBeInTheDocument();
    expect(screen.queryByText('Chưa có luồng chính sách nào')).not.toBeInTheDocument();
  });

  // 26. Independent read failure states for selectedStreamQuery
  it('renders QueryFailure in detail section when selectedStreamQuery fails', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const streamSummary: BusinessPolicyStreamRecord = {
      id: 'stream-err',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-err')) {
        return jsonResponse({ statusCode: 500, message: 'Detail load failed' }, 500);
      }
      if (url.includes('/business-configuration/policies')) {
        return jsonResponse({ items: [streamSummary], page: 1, pageSize: 20, total: 1 });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));

    expect(await screen.findByRole('heading', { name: 'Chi tiết luồng và lịch sử phiên bản' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /thử lại/i })).toBeInTheDocument();
  });

  // 27. ACADEMIC_YEAR Adapter wiring: creates draft with exact academicYearId
  it('wires ACADEMIC_YEAR resource picker and sends exact academicYearId on create draft', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_ACADEMIC_YEAR_CONFIG',
        resourceKind: 'ACADEMIC_YEAR',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'ACADEMIC_OFFICE',
      },
    ];

    let createdBody: CapturedCommandBody | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/drafts') && init?.method === 'POST') {
        createdBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return jsonResponse({ outcome: 'CREATED', streamId: 'stream-ay', versionId: 'ver-ay' });
      }
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[TEST_ACADEMIC_YEAR_CONFIG_ADAPTER]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo bản nháp' }));

    // Resource picker rendered
    expect(screen.getByTestId('test-academic-year-resource-picker')).toBeInTheDocument();

    // Select academic year
    fireEvent.change(screen.getByRole('combobox', { name: 'Chọn năm học áp dụng' }), {
      target: { value: EXACT_TEST_ACADEMIC_YEAR_ID },
    });
    fireEvent.change(screen.getByLabelText(/ngày bắt đầu hiệu lực/i), {
      target: { value: '2026-09-05' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    await waitFor(() => expect(createdBody).not.toBeNull());
    expect(createdBody).toMatchObject({
      family: 'TEST_ACADEMIC_YEAR_CONFIG',
      resource: {
        kind: 'ACADEMIC_YEAR',
        academicYearId: EXACT_TEST_ACADEMIC_YEAR_ID,
      },
      payload: { maxCredits: 30 },
      effectiveFrom: '2026-09-05',
    });
  });

  // 28. ACADEMIC_YEAR Adapter wiring: fails closed if ResourceEditorComponent is missing
  it('fails closed when an ACADEMIC_YEAR family has an adapter lacking ResourceEditorComponent', async () => {
    const adapterWithoutResourceEditor: BusinessPolicyUiAdapter<{ val: string }> = {
      familyKey: 'TEST_ACADEMIC_YEAR_CONFIG',
      validatorVersion: '1.0.0',
      displayName: 'Không có resource editor',
      description: 'Adapter thiếu resource editor',
      resourceKind: 'ACADEMIC_YEAR',
      initialPayload: () => ({ val: 'test' }),
      validatePayload: () => ({ valid: true, payload: { val: 'test' } }),
      EditorComponent: () => <div>Editor</div>,
      SummaryComponent: () => <div>Summary</div>,
      // ResourceEditorComponent omitted intentionally
    };

    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_ACADEMIC_YEAR_CONFIG',
        resourceKind: 'ACADEMIC_YEAR',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'ACADEMIC_OFFICE',
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[adapterWithoutResourceEditor]} />);
    await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' });

    expect(screen.getByText('Giao diện quản trị thiếu thành phần chọn tài nguyên năm học bắt buộc.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạo bản nháp' })).not.toBeInTheDocument();
  });

  // 29. ACADEMIC_YEAR Resolution sends exact academicYearId
  it('wires ACADEMIC_YEAR resource picker into exact-date resolution and sends academicYearId', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_ACADEMIC_YEAR_CONFIG',
        resourceKind: 'ACADEMIC_YEAR',
        currentValidatorVersion: '1.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'ACADEMIC_OFFICE',
      },
    ];

    let requestedUrl = '';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      if (url.includes('/business-configuration/resolve')) {
        requestedUrl = url;
        return jsonResponse({
          outcome: 'RESOLVED',
          family: 'TEST_ACADEMIC_YEAR_CONFIG',
          resource: { kind: 'ACADEMIC_YEAR', academicYearId: EXACT_TEST_ACADEMIC_YEAR_ID },
          requestedCivilDate: '2026-09-15',
          validatorVersion: '1.0.0',
          payload: { maxCredits: 30 },
          effectiveFrom: '2026-09-01',
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(<BusinessConfigurationPage adapters={[TEST_ACADEMIC_YEAR_CONFIG_ADAPTER]} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Nhóm chính sách' }), {
      target: { value: 'TEST_ACADEMIC_YEAR_CONFIG' },
    });

    // Resource picker should appear in resolution form
    expect(screen.getByTestId('test-academic-year-resource-picker')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Chọn năm học áp dụng' }), {
      target: { value: EXACT_TEST_ACADEMIC_YEAR_ID },
    });
    fireEvent.change(screen.getByLabelText(/ngày dân sự cần tra cứu/i), {
      target: { value: '2026-09-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));

    await waitFor(() => expect(requestedUrl).toContain(`academicYearId=${EXACT_TEST_ACADEMIC_YEAR_ID}`));
    expect(requestedUrl).toContain('kind=ACADEMIC_YEAR');
    expect(await screen.findByText('Tín chỉ tối đa: 30')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------------------------------
  // 30. VERSION-AWARE REGRESSION TESTS (Section 16 of forward correction instructions)
  // -------------------------------------------------------------------------------------------------

  // 16.1. Backend current family = v2, only v1 adapter exists -> current mutation disabled
  it('16.1: disables current mutation with explicit mismatch error when backend is v2 and only v1 adapter exists', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '2.0.0',
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

    renderWithQuery(<BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER]} />); // Only v1 adapter provided
    await screen.findByRole('heading', { name: 'Chính sách nghiệp vụ' });

    expect(
      screen.getByText('Giao diện quản trị chưa hỗ trợ phiên bản hợp đồng hiện tại của nhóm chính sách.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạo bản nháp' })).not.toBeInTheDocument();
  });

  // 16.2. Backend current family = v2, v1 + v2 adapters exist -> create uses v2 adapter
  it('16.2: uses v2 adapter when backend family currentValidatorVersion is 2.0.0 and both v1 and v2 exist', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '2.0.0',
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
        return jsonResponse({ outcome: 'CREATED', streamId: 'stream-1', versionId: 'ver-v2' });
      }
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage
        adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER, TEST_BOOLEAN_THRESHOLD_V2_ADAPTER]}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Tạo bản nháp' }));

    // Verify v2 editor rendered
    expect(screen.getByTestId('test-adapter-editor-v2')).toBeInTheDocument();
    expect(screen.getByLabelText('Kích hoạt ngưỡng v2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ngày bắt đầu hiệu lực/i), { target: { value: '2026-09-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));

    await waitFor(() => expect(createdBody).not.toBeNull());
    // Initial payload of v2 is threshold 25
    expect((createdBody as CapturedCommandBody | null)?.payload).toMatchObject({ enabled: true, threshold: 25 });
  });

  // 16.3. Historical PUBLISHED v1 -> summary uses v1 adapter
  it('16.3: renders historical published version using exact v1 adapter summary', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '2.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-hist',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        makeMockVersion({
          id: 'ver-v1-hist',
          streamId: 'stream-hist',
          versionNumber: 1,
          status: 'PUBLISHED',
          validatorVersion: '1.0.0',
          payload: { enabled: true, threshold: 12 },
        }),
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-hist')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage
        adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER, TEST_BOOLEAN_THRESHOLD_V2_ADAPTER]}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));

    expect(await screen.findByTestId('test-adapter-summary')).toBeInTheDocument();
    expect(screen.getByText('Ngưỡng: 12')).toBeInTheDocument();
  });

  // 16.4. Historical v1 with no v1 adapter -> no raw payload, metadata-only
  it('16.4: does not display raw payload when historical version lacks exact version adapter', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '2.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-hist-nov1',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        makeMockVersion({
          id: 'ver-v1-noadapter',
          streamId: 'stream-hist-nov1',
          versionNumber: 1,
          status: 'PUBLISHED',
          validatorVersion: '1.0.0',
          payload: { secretData: 'TOP_SECRET_V1' },
        }),
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-hist-nov1')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    // Only v2 adapter is provided, v1 adapter is absent
    renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_V2_ADAPTER]} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));

    expect(await screen.findByText(/giao diện quản trị chưa hỗ trợ hiển thị nội dung cho phiên bản xác thực này \(1\.0\.0\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/TOP_SECRET_V1/)).not.toBeInTheDocument();
    expect(screen.getByText('ver-v1-noadapter')).toBeInTheDocument(); // Metadata remains visible
  });

  // 16.5. DRAFT v1 while current family v2 -> edit uses v1 adapter
  it('16.5: edits retained v1 draft using exact v1 adapter even when current family version is v2', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '2.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-draft-v1',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        makeMockVersion({
          id: 'ver-draft-v1',
          streamId: 'stream-draft-v1',
          versionNumber: 1,
          status: 'DRAFT',
          validatorVersion: '1.0.0',
          payload: { enabled: true, threshold: 14 },
        }),
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-draft-v1')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage
        adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER, TEST_BOOLEAN_THRESHOLD_V2_ADAPTER]}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Chỉnh sửa bản nháp' }));

    // Uses v1 editor
    expect(await screen.findByTestId('test-adapter-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('test-adapter-editor-v2')).not.toBeInTheDocument();
  });

  // 16.6. DRAFT v1 publish -> allowed only with exact v1 adapter
  it('16.6: allows publish of v1 draft when exact v1 adapter is present, disables when absent', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '2.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-draft-v1-pub',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        makeMockVersion({
          id: 'ver-draft-v1-pub',
          streamId: 'stream-draft-v1-pub',
          versionNumber: 1,
          status: 'DRAFT',
          validatorVersion: '1.0.0',
          payload: { enabled: true, threshold: 14 },
        }),
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-draft-v1-pub')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    // Case A: when only v2 adapter is provided, publish is disabled with message
    const { unmount } = renderWithQuery(
      <BusinessConfigurationPage adapters={[TEST_BOOLEAN_THRESHOLD_V2_ADAPTER]} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));
    expect(await screen.findByText('Không thể thao tác vì thiếu giao diện cho phiên bản 1.0.0.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Công bố' })).not.toBeInTheDocument();
    unmount();

    // Case B: when exact v1 adapter is provided, publish button is enabled
    renderWithQuery(
      <BusinessConfigurationPage
        adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER, TEST_BOOLEAN_THRESHOLD_V2_ADAPTER]}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));
    expect(await screen.findByRole('button', { name: 'Công bố' })).toBeInTheDocument();
  });

  // 16.7. RESOLVED result validatorVersion=v1 -> summary uses v1 adapter
  it('16.7: renders resolution result with v1 adapter summary when result validatorVersion is 1.0.0', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '2.0.0',
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
          outcome: 'RESOLVED',
          family: 'TEST_BOOLEAN_THRESHOLD',
          resource: { kind: 'SCHOOL_WIDE' },
          requestedCivilDate: '2026-09-01',
          validatorVersion: '1.0.0',
          payload: { enabled: true, threshold: 10 },
          effectiveFrom: '2026-09-01',
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage
        adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER, TEST_BOOLEAN_THRESHOLD_V2_ADAPTER]}
      />,
    );
    fireEvent.change(await screen.findByRole('combobox', { name: 'Nhóm chính sách' }), {
      target: { value: 'TEST_BOOLEAN_THRESHOLD' },
    });
    fireEvent.change(screen.getByLabelText(/ngày dân sự cần tra cứu/i), {
      target: { value: '2026-09-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));

    // Renders v1 summary
    expect(await screen.findByTestId('test-adapter-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('test-adapter-summary-v2')).not.toBeInTheDocument();
  });

  // 16.8. Correction source=v1/current=v2 -> source payload is not silently reinterpreted by v2 editor
  it('16.8: does not silently preload v1 payload into v2 correction editor; initializes from v2 initialPayload', async () => {
    const families: BusinessPolicyFamilyMetadata[] = [
      {
        key: 'TEST_BOOLEAN_THRESHOLD',
        resourceKind: 'SCHOOL_WIDE',
        currentValidatorVersion: '2.0.0',
        publicationEnabled: true,
        downstreamAuthority: 'TEST_AUTHORITY',
      },
    ];
    const stream: BusinessPolicyStreamRecord = {
      id: 'stream-correct-v1',
      familyKey: 'TEST_BOOLEAN_THRESHOLD',
      resourceKind: 'SCHOOL_WIDE',
      academicYearId: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      versions: [
        makeMockVersion({
          id: 'ver-source-v1',
          streamId: 'stream-correct-v1',
          versionNumber: 1,
          status: 'PUBLISHED',
          validatorVersion: '1.0.0',
          payload: { enabled: true, threshold: 10 }, // old v1 payload threshold 10
          effectiveFrom: '2026-09-01T00:00:00.000Z',
        }),
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/business-configuration/families')) return jsonResponse(families);
      if (url.includes('/business-configuration/policies/stream-correct-v1')) return jsonResponse(stream);
      if (url.includes('/business-configuration/policies')) return jsonResponse({ items: [stream], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <BusinessConfigurationPage
        adapters={[TEST_BOOLEAN_THRESHOLD_ADAPTER, TEST_BOOLEAN_THRESHOLD_V2_ADAPTER]}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Xem lịch sử' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa sai lịch sử' }));

    // Editor should be v2
    expect(await screen.findByTestId('test-adapter-editor-v2')).toBeInTheDocument();
    // In v2, initial threshold is 25 (NOT the 10 from v1!)
    const input = screen.getByRole('spinbutton', { name: 'Ngưỡng tối thiểu v2' }) as HTMLInputElement;
    expect(input.value).toBe('25');
  });
});
