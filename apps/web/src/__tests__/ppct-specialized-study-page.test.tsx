import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CapabilityKey,
  CapabilityScope,
  CivilDateString,
  PpctClassAssociationRecord,
  PpctPlanRecord,
  PpctVersionContent,
  PpctVersionRecord,
  PpctWorkspaceAcademicYearOption,
  PpctWorkspaceClassOption,
  PpctWorkspaceSubjectOption,
} from '@baogiang/contracts';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

function authWith(key?: CapabilityKey, scope: CapabilityScope = 'SCHOOL_WIDE', resourceId?: string) {
  return {
    ...normalAuth,
    capabilities: key ? [{ key, scope, ...(resourceId ? { resourceId } : {}) }] : [],
  };
}

const schoolAuth = authWith('PPCT_MANAGE', 'SCHOOL_WIDE');
const subjectAuth = authWith('PPCT_MANAGE', 'SUBJECT', 'subject-math');

const years: PpctWorkspaceAcademicYearOption[] = [
  { id: 'year-1', code: '2026-2027', name: 'Năm học 2026-2027' },
];

const classes: PpctWorkspaceClassOption[] = [
  { id: 'class-10a1', code: '10A1', name: '10A1', gradeLevel: 10, status: 'ACTIVE' },
  { id: 'class-11b1', code: '11B1', name: '11B1', gradeLevel: 11, status: 'ACTIVE' },
];

const subjects: PpctWorkspaceSubjectOption[] = [
  { id: 'subject-math', code: 'TOAN', name: 'Toán học', status: 'ACTIVE' },
  { id: 'subject-lit', code: 'VAN', name: 'Ngữ văn', status: 'ACTIVE' },
];

const plan10Math: PpctPlanRecord = {
  id: 'plan-1',
  academicYearId: 'year-1',
  subjectId: 'subject-math',
  gradeLevel: 10,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

const publishedVersionWithSpecialized: PpctVersionRecord = {
  id: 'ver-pub-spec',
  ppctPlanId: 'plan-1',
  versionNumber: 1,
  status: 'PUBLISHED',
  createdByUserId: 'u1',
  publishedByUserId: 'u1',
  publishedAt: '2026-08-05T00:00:00Z',
  supersededByUserId: null,
  supersededAt: null,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-05T00:00:00Z',
  itemCount: 2,
};

const contentWithSpecialized: PpctVersionContent = {
  version: publishedVersionWithSpecialized,
  items: [
    {
      id: 'rev-1',
      ppctVersionId: 'ver-pub-spec',
      ppctPlanId: 'plan-1',
      itemId: 'item-1',
      component: 'CORE',
      sequence: 1,
      displaySequence: '1',
      title: 'Hàm số bậc nhất',
      lessonType: 'LT',
      createdAt: '2026-08-01T00:00:00Z',
    },
    {
      id: 'rev-2',
      ppctVersionId: 'ver-pub-spec',
      ppctPlanId: 'plan-1',
      itemId: 'item-2',
      component: 'SPECIALIZED_STUDY',
      sequence: 1,
      displaySequence: 'CD1',
      title: 'Chuyên đề toán thực tế',
      lessonType: 'CD',
      createdAt: '2026-08-01T00:00:00Z',
    },
  ],
  lineage: [],
};

const publishedVersionCoreOnly: PpctVersionRecord = {
  id: 'ver-pub-core',
  ppctPlanId: 'plan-1',
  versionNumber: 2,
  status: 'PUBLISHED',
  createdByUserId: 'u1',
  publishedByUserId: 'u1',
  publishedAt: '2026-08-06T00:00:00Z',
  supersededByUserId: null,
  supersededAt: null,
  createdAt: '2026-08-02T00:00:00Z',
  updatedAt: '2026-08-06T00:00:00Z',
  itemCount: 1,
};

const contentCoreOnly: PpctVersionContent = {
  version: publishedVersionCoreOnly,
  items: [
    {
      id: 'rev-1',
      ppctVersionId: 'ver-pub-core',
      ppctPlanId: 'plan-1',
      itemId: 'item-1',
      component: 'CORE',
      sequence: 1,
      displaySequence: '1',
      title: 'Hàm số bậc nhất',
      lessonType: 'LT',
      createdAt: '2026-08-01T00:00:00Z',
    },
  ],
  lineage: [],
};

const draftVersion: PpctVersionRecord = {
  id: 'ver-draft',
  ppctPlanId: 'plan-1',
  versionNumber: 3,
  status: 'DRAFT',
  createdByUserId: 'u1',
  publishedByUserId: null,
  publishedAt: null,
  supersededByUserId: null,
  supersededAt: null,
  createdAt: '2026-08-03T00:00:00Z',
  updatedAt: '2026-08-03T00:00:00Z',
  itemCount: 1,
};

const existingAssociation: PpctClassAssociationRecord = {
  id: 'assoc-1',
  academicYearId: 'year-1',
  schoolClassId: 'class-10a1',
  subjectId: 'subject-math',
  gradeLevel: 10,
  ppctPlanId: 'plan-1',
  ppctVersionId: 'ver-pub-spec',
  ppctVersionStatus: 'PUBLISHED',
  curricularProfile: 'CORE_ONLY',
  effectiveFrom: '2026-09-01' as CivilDateString,
  effectiveUntil: null,
  createdByUserId: 'u1',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

function setupMockFetch(overrides: {
  auth?: ReturnType<typeof authWith>;
  workspaceSubjects?: PpctWorkspaceSubjectOption[];
  plans?: PpctPlanRecord[];
  versions?: PpctVersionRecord[];
  content?: PpctVersionContent;
  history?: PpctClassAssociationRecord[];
  switchHandler?: (body: unknown) => Response;
} = {}) {
  const capturedRequests: Array<{ url: string; method: string; body?: unknown }> = [];

  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    capturedRequests.push({ url, method, body });

    if (url.endsWith('/auth/me')) {
      return jsonResponse(overrides.auth ?? schoolAuth);
    }
    if (url.includes('/ppct-options/academic-years') && !url.includes('/ppct-options/academic-years/')) {
      return jsonResponse({ items: years, page: 1, pageSize: 100, total: years.length });
    }
    if (url.includes('/ppct-options/academic-years/year-1')) {
      return jsonResponse({
        academicYear: years[0],
        classes,
        subjects: overrides.workspaceSubjects ?? subjects,
      });
    }
    if (url.includes('/ppct-plans') && !url.includes('/versions')) {
      const items = overrides.plans !== undefined ? overrides.plans : [plan10Math];
      return jsonResponse({ items, page: 1, pageSize: 10, total: items.length });
    }
    if (url.includes('/versions') && !url.includes('/content')) {
      const items = overrides.versions !== undefined ? overrides.versions : [publishedVersionWithSpecialized, draftVersion];
      return jsonResponse({ items, page: 1, pageSize: 100, total: items.length });
    }
    if (url.includes('/content')) {
      const content = overrides.content !== undefined ? overrides.content : contentWithSpecialized;
      return jsonResponse(content);
    }
    if (url.includes('/ppct-associations/switch')) {
      if (overrides.switchHandler) return overrides.switchHandler(body);
      return jsonResponse({
        previousAssociation: existingAssociation,
        association: { ...existingAssociation, id: 'assoc-2', curricularProfile: 'CORE_PLUS_SPECIALIZED_STUDY' },
      }, 201);
    }
    if (url.includes('/ppct-associations')) {
      const items = overrides.history !== undefined ? overrides.history : [existingAssociation];
      return jsonResponse({ items });
    }

    return jsonResponse({});
  });

  vi.stubGlobal('fetch', mock);
  return { mock, capturedRequests };
}

describe('PpctSpecializedStudyPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 1-7: Capability & direct route tests
  it('denies direct access to user without PPCT_MANAGE and shows access denied', async () => {
    setupMockFetch({ auth: normalAuth });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
    expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Áp dụng chuyên đề' })).not.toBeInTheDocument();
  });

  it('denies direct access to SYSTEM_ADMIN alone without PPCT_MANAGE', async () => {
    setupMockFetch({
      auth: authWith('SYSTEM_ADMIN'),
    });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
    expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
  });

  it('denies direct access to SUBJECT_MANAGE alone without PPCT_MANAGE', async () => {
    setupMockFetch({
      auth: authWith('SUBJECT_MANAGE'),
    });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
    expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
  });

  it('allows access to user with PPCT_MANAGE / SCHOOL_WIDE', async () => {
    setupMockFetch({ auth: schoolAuth });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
    expect(await screen.findByRole('heading', { name: 'Áp dụng chuyên đề' })).toBeInTheDocument();
  });

  it('allows access to user with PPCT_MANAGE / SUBJECT', async () => {
    setupMockFetch({ auth: subjectAuth });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
    expect(await screen.findByRole('heading', { name: 'Áp dụng chuyên đề' })).toBeInTheDocument();
  });

  // 8-10: Scoped options endpoints, no generic /subjects leakage
  it('uses /ppct-options/academic-years instead of generic /subjects or /academic-years', async () => {
    const { capturedRequests } = setupMockFetch();
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
    await screen.findByRole('heading', { name: 'Áp dụng chuyên đề' });

    expect(capturedRequests.some((r) => r.url.includes('/api/ppct-options/academic-years'))).toBe(true);
    expect(capturedRequests.some((r) => r.url.endsWith('/api/subjects'))).toBe(false);
    expect(capturedRequests.some((r) => r.url.endsWith('/api/academic-years'))).toBe(false);
  });

  it('renders exact server-filtered subject options in the dropdown', async () => {
    setupMockFetch({
      workspaceSubjects: [{ id: 'subject-math', code: 'TOAN', name: 'Toán học', status: 'ACTIVE' }],
    });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
    await screen.findByRole('heading', { name: 'Áp dụng chuyên đề' });

    const subjectSelect = await screen.findByLabelText('Môn học');
    const options = within(subjectSelect).getAllByRole('option');
    // "Chọn môn học" + 1 subject
    expect(options).toHaveLength(2);
    expect(options[1]).toHaveTextContent('TOAN — Toán học');
    expect(screen.queryByText(/Ngữ văn/i)).not.toBeInTheDocument();
  });

  it('shows empty state when workspace has no authorized subjects for the user', async () => {
    setupMockFetch({ workspaceSubjects: [] });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
    expect(await screen.findByRole('heading', { name: 'Chưa có môn học được cấp quyền' })).toBeInTheDocument();
  });

  // 11-13: Selection flow, class grade drives plans query, no plan state
  it('uses class gradeLevel to query plans for exact class and subject', async () => {
    const { capturedRequests } = setupMockFetch();
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');
    await screen.findByRole('heading', { name: 'Áp dụng chuyên đề' });

    const classSelect = await screen.findByLabelText('Lớp học');
    fireEvent.change(classSelect, { target: { value: 'class-10a1' } });

    const subjectSelect = await screen.findByLabelText('Môn học');
    fireEvent.change(subjectSelect, { target: { value: 'subject-math' } });

    await waitFor(() => {
      const planReq = capturedRequests.find((r) => r.url.includes('/ppct-plans'));
      expect(planReq).toBeDefined();
      expect(planReq!.url).toContain('gradeLevel=10');
      expect(planReq!.url).toContain('subjectId=subject-math');
    });
  });

  it('shows empty state when no PPCT plan exists for the selected grade and subject', async () => {
    setupMockFetch({ plans: [] });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    const classSelect = await screen.findByLabelText('Lớp học');
    fireEvent.change(classSelect, { target: { value: 'class-10a1' } });

    const subjectSelect = await screen.findByLabelText('Môn học');
    fireEvent.change(subjectSelect, { target: { value: 'subject-math' } });

    expect(await screen.findByRole('heading', { name: 'Chưa có kế hoạch PPCT phù hợp' })).toBeInTheDocument();
  });

  it('fails closed when multiple plans are unexpectedly returned for same grade and subject', async () => {
    setupMockFetch({
      plans: [
        plan10Math,
        { ...plan10Math, id: 'plan-duplicate' },
      ],
    });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    const classSelect = await screen.findByLabelText('Lớp học');
    fireEvent.change(classSelect, { target: { value: 'class-10a1' } });

    const subjectSelect = await screen.findByLabelText('Môn học');
    fireEvent.change(subjectSelect, { target: { value: 'subject-math' } });

    expect(await screen.findByText(/Phát hiện nhiều hơn một kế hoạch PPCT/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi hồ sơ' })).not.toBeInTheDocument();
  });

  // 14: Versions filter: only PUBLISHED versions are selectable
  it('allows selection only of PUBLISHED versions and filters out DRAFT versions', async () => {
    setupMockFetch({
      versions: [publishedVersionWithSpecialized, draftVersion],
    });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    const versionSelect = await screen.findByLabelText('Phiên bản PPCT công bố');
    await waitFor(() => {
      expect(within(versionSelect).getByRole('option', { name: /Bản 1/ })).toBeInTheDocument();
    });
    const options = within(versionSelect).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(within(versionSelect).queryByRole('option', { name: /Bản 3/ })).not.toBeInTheDocument();
  });

  it('shows notice and disables submit when no PUBLISHED version exists', async () => {
    setupMockFetch({
      versions: [draftVersion],
    });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    expect(await screen.findByText(/Kế hoạch PPCT chưa có phiên bản nào được công bố/i)).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: 'Lưu thay đổi hồ sơ' });
    expect(submitBtn).toBeDisabled();
  });

  // 15-16: Retained history rendering
  it('renders retained association history table and badges', async () => {
    setupMockFetch({ history: [existingAssociation] });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    expect(await screen.findByRole('heading', { name: 'Lịch sử áp dụng hồ sơ PPCT' })).toBeInTheDocument();
    expect(screen.getByText('01/09/2026')).toBeInTheDocument();
    expect(screen.getByText('Không giới hạn')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Chỉ nội dung cốt lõi');
    expect(screen.getByText('Mới nhất')).toBeInTheDocument();
    expect(screen.queryByText('Đang áp dụng')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hiện hành/i)).not.toBeInTheDocument();
  });

  it('renders future association with Không giới hạn, Mới nhất, and never Đang áp dụng or Hiện hành', async () => {
    const futureAssociation: PpctClassAssociationRecord = {
      ...existingAssociation,
      id: 'assoc-future',
      effectiveFrom: '2028-09-01' as CivilDateString,
      effectiveUntil: null,
    };
    setupMockFetch({ history: [futureAssociation] });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    expect(await screen.findByRole('heading', { name: 'Lịch sử áp dụng hồ sơ PPCT' })).toBeInTheDocument();
    expect(screen.getByText('01/09/2028')).toBeInTheDocument();
    expect(screen.getByText('Không giới hạn')).toBeInTheDocument();
    expect(screen.getByText('Mới nhất')).toBeInTheDocument();
    expect(screen.queryByText('Đang áp dụng')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hiện hành/i)).not.toBeInTheDocument();
  });

  it('renders initial empty state when no prior association history exists', async () => {
    setupMockFetch({ history: [] });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    expect(await screen.findByRole('heading', { name: 'Chưa có lịch sử liên kết' })).toBeInTheDocument();
  });

  // 17-20: Mutation payloads: CORE_ONLY, CORE_PLUS_SPECIALIZED_STUDY, CAS expectedLatestAssociationId
  it('submits exact CORE_ONLY payload with expectedLatestAssociationId from history', async () => {
    const { capturedRequests } = setupMockFetch({ history: [existingAssociation] });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    const dateInput = await screen.findByLabelText(/Hiệu lực từ/i);
    fireEvent.change(dateInput, { target: { value: '2026-09-15' } });

    const submitBtn = screen.getByRole('button', { name: 'Lưu thay đổi hồ sơ' });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const switchReq = capturedRequests.find((r) => r.url.includes('/ppct-associations/switch'));
      expect(switchReq).toBeDefined();
      expect(switchReq!.body).toEqual({
        ppctVersionId: 'ver-pub-spec',
        curricularProfile: 'CORE_ONLY',
        effectiveFrom: '2026-09-15',
        expectedLatestAssociationId: 'assoc-1',
      });
    });
  });

  it('sends null expectedLatestAssociationId when there is no prior history', async () => {
    const { capturedRequests } = setupMockFetch({ history: [] });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    const dateInput = await screen.findByLabelText(/Hiệu lực từ/i);
    fireEvent.change(dateInput, { target: { value: '2026-09-01' } });

    const submitBtn = screen.getByRole('button', { name: 'Lưu thay đổi hồ sơ' });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const switchReq = capturedRequests.find((r) => r.url.includes('/ppct-associations/switch'));
      expect(switchReq).toBeDefined();
      expect(switchReq!.body).toEqual({
        ppctVersionId: 'ver-pub-spec',
        curricularProfile: 'CORE_ONLY',
        effectiveFrom: '2026-09-01',
        expectedLatestAssociationId: null,
      });
    });
  });

  // 21-22: Specialized study preflight
  it('allows CORE_PLUS_SPECIALIZED_STUDY when version contains specialized study content', async () => {
    const { capturedRequests } = setupMockFetch({ content: contentWithSpecialized });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    const profileSelect = await screen.findByLabelText('Hồ sơ áp dụng');
    fireEvent.change(profileSelect, { target: { value: 'CORE_PLUS_SPECIALIZED_STUDY' } });

    const dateInput = screen.getByLabelText(/Hiệu lực từ/i);
    fireEvent.change(dateInput, { target: { value: '2026-09-15' } });

    expect(screen.queryByText(/Phiên bản PPCT được chọn không chứa bài chuyên đề nào/i)).not.toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: 'Lưu thay đổi hồ sơ' });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const switchReq = capturedRequests.find((r) => r.url.includes('/ppct-associations/switch'));
      expect(switchReq).toBeDefined();
      expect(switchReq!.body).toMatchObject({
        curricularProfile: 'CORE_PLUS_SPECIALIZED_STUDY',
      });
    });
  });

  it('blocks CORE_PLUS_SPECIALIZED_STUDY mutation and shows warning when version lacks specialized study content', async () => {
    setupMockFetch({ content: contentCoreOnly });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    const profileSelect = await screen.findByLabelText('Hồ sơ áp dụng');
    fireEvent.change(profileSelect, { target: { value: 'CORE_PLUS_SPECIALIZED_STUDY' } });

    const dateInput = screen.getByLabelText(/Hiệu lực từ/i);
    fireEvent.change(dateInput, { target: { value: '2026-09-15' } });

    expect(await screen.findByText(/Phiên bản PPCT được chọn không chứa bài chuyên đề nào/i)).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: 'Lưu thay đổi hồ sơ' });
    expect(submitBtn).toBeDisabled();
  });

  // 23: Civil date string preservation
  it('preserves exact YYYY-MM-DD civil date string without timezone shift', async () => {
    const { capturedRequests } = setupMockFetch();
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    const dateInput = await screen.findByLabelText(/Hiệu lực từ/i);
    fireEvent.change(dateInput, { target: { value: '2026-11-09' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi hồ sơ' }));

    await waitFor(() => {
      const switchReq = capturedRequests.find((r) => r.url.includes('/ppct-associations/switch'));
      expect(switchReq).toBeDefined();
      expect(switchReq!.body).toMatchObject({
        effectiveFrom: '2026-11-09',
      });
    });
  });

  // 24: Week-split error handling: message shown, form retained, no auto-retry, no history refetch
  it('displays business week-split error message and retains form values on 409 week split without statusCode in body', async () => {
    let switchCalls = 0;
    const { capturedRequests } = setupMockFetch({
      switchHandler: () => {
        switchCalls += 1;
        return jsonResponse(
          {
            error: 'PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT',
            message: 'Thay đổi hồ sơ áp dụng chương trình không được chia cắt tuần học nghiệp vụ.',
          },
          409,
        );
      },
    });
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    const dateInput = await screen.findByLabelText(/Hiệu lực từ/i);
    fireEvent.change(dateInput, { target: { value: '2026-09-03' } });

    const profileSelect = screen.getByLabelText('Hồ sơ áp dụng') as HTMLSelectElement;
    fireEvent.change(profileSelect, { target: { value: 'CORE_PLUS_SPECIALIZED_STUDY' } });

    const targetVersionSelect = screen.getByLabelText('Phiên bản PPCT công bố') as HTMLSelectElement;
    const originalVersionValue = targetVersionSelect.value;

    const submitBtn = screen.getByRole('button', { name: 'Lưu thay đổi hồ sơ' });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText('Ngày hiệu lực làm thay đổi hồ sơ trong cùng một tuần học. Hãy chọn ranh giới tuần hợp lệ.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Dữ liệu áp dụng đã thay đổi/i)).not.toBeInTheDocument();

    // Exactly 1 switch call (NO automatic retry)
    expect(switchCalls).toBe(1);

    // Form values retained
    expect((screen.getByLabelText(/Hiệu lực từ/i) as HTMLInputElement).value).toBe('2026-09-03');
    expect((screen.getByLabelText('Hồ sơ áp dụng') as HTMLSelectElement).value).toBe('CORE_PLUS_SPECIALIZED_STUDY');
    expect((screen.getByLabelText('Phiên bản PPCT công bố') as HTMLSelectElement).value).toBe(originalVersionValue);

    // History is NOT refetched for week-split
    const historyReqs = capturedRequests.filter((r) => r.url.includes('/ppct-associations') && r.method === 'GET');
    expect(historyReqs.length).toBe(1);
  });

  // 25-26: Stale conflict CAS: no auto retry, refetches history, user can resubmit manually
  it('handles stale association conflict by showing alert, refetching history, and requiring manual resubmit', async () => {
    let switchCalls = 0;
    const { capturedRequests } = setupMockFetch({
      history: [existingAssociation],
      switchHandler: () => {
        switchCalls += 1;
        return jsonResponse(
          {
            statusCode: 409,
            message: 'Liên kết PPCT mới nhất của lớp đã thay đổi; hãy tải lại trước khi tiếp tục.',
          },
          409,
        );
      },
    });

    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    const dateInput = await screen.findByLabelText(/Hiệu lực từ/i);
    fireEvent.change(dateInput, { target: { value: '2026-09-15' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi hồ sơ' }));

    expect(
      await screen.findByText('Dữ liệu áp dụng đã thay đổi. Hệ thống đã tải lại lịch sử mới nhất; hãy kiểm tra trước khi lưu lại.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/chia cắt tuần học/i)).not.toBeInTheDocument();

    // Exactly 1 switch call (NO automatic retry)
    expect(switchCalls).toBe(1);

    // Form inputs retained
    expect((screen.getByLabelText(/Hiệu lực từ/i) as HTMLInputElement).value).toBe('2026-09-15');

    // History was refetched
    await waitFor(() => {
      const historyReqs = capturedRequests.filter((r) => r.url.includes('/ppct-associations') && r.method === 'GET');
      expect(historyReqs.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('does not send any dead ppct-resolution requests during normal workspace lifecycle', async () => {
    const { capturedRequests } = setupMockFetch();
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    expect(await screen.findByRole('heading', { name: 'Áp dụng chuyên đề' })).toBeInTheDocument();
    expect(capturedRequests.some((r) => r.url.includes('ppct-resolution'))).toBe(false);
  });

  // 27: Success flow
  it('shows success message and refetches history on successful mutation', async () => {
    const { capturedRequests } = setupMockFetch();
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    fireEvent.change(await screen.findByLabelText('Lớp học'), { target: { value: 'class-10a1' } });
    fireEvent.change(await screen.findByLabelText('Môn học'), { target: { value: 'subject-math' } });

    const dateInput = await screen.findByLabelText(/Hiệu lực từ/i);
    fireEvent.change(dateInput, { target: { value: '2026-09-15' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi hồ sơ' }));

    expect(await screen.findByText('Đã cập nhật hồ sơ áp dụng PPCT và giữ lại lịch sử trước đó.')).toBeInTheDocument();

    // History refetched
    await waitFor(() => {
      const historyReqs = capturedRequests.filter((r) => r.url.includes('/ppct-associations') && r.method === 'GET');
      expect(historyReqs.length).toBeGreaterThanOrEqual(2);
    });
  });

  // 28: Loading & error states
  it('renders loading and error state when years query fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/auth/me')) return jsonResponse(schoolAuth);
        return jsonResponse({ statusCode: 500, message: 'Server error' }, 500);
      }),
    );
    renderApp('/quan-tri/ppct/ap-dung-chuyen-de');

    expect(await screen.findByText('Chưa tải được dữ liệu')).toBeInTheDocument();
  });
});
