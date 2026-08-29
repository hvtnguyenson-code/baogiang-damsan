import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const YEAR_ID = '11111111-1111-4111-8111-111111111111';
const CLASS_ID = '22222222-2222-4222-8222-222222222222';
const SUBJECT_ID = '33333333-3333-4333-8333-333333333333';
const REVISION_ID = '44444444-4444-4444-8444-444444444444';

const workspaceBase = {
  academicYears: [{ id: YEAR_ID, code: '2026-2027', name: 'Năm học 2026–2027', activeCalendar: { startDate: '2026-08-01', endDate: '2027-05-31' } }],
  selectedAcademicYear: null,
};

const workspaceSelected = {
  academicYears: workspaceBase.academicYears,
  selectedAcademicYear: {
    ...workspaceBase.academicYears[0],
    schoolClasses: [{ id: CLASS_ID, code: '12A3', name: 'Lớp 12A3', status: 'ACTIVE' }],
    subjects: [{ id: SUBJECT_ID, code: 'DIA', name: 'Địa lý', status: 'ACTIVE' }],
  },
};

const counts = { distributedElapsedCount: 2, completedCount: 1, openDebtCount: 1, lateCount: 0, unconfirmedGapCount: 0 };
const interval = { teachingAssignmentId: 'hidden-assignment-id', schoolClassId: CLASS_ID, subjectId: SUBJECT_ID, validFrom: '2026-08-01', validUntil: null };
const evidence = {
  academicYearId: YEAR_ID, schoolClassId: CLASS_ID, subjectId: SUBJECT_ID, classification: 'COMPLETED',
  sourceNormalOccurrenceKey: 'hidden-occurrence-key', originalTimetableVersionId: 'hidden', originalTimetableEntryId: 'hidden',
  sourceCivilDate: '2026-08-18', sourceAcademicCalendarVersionId: 'hidden', sourceTimeSlotDefinitionId: 'hidden',
  sourceSlotStart: '07:00', sourceSlotEnd: '07:45', originalTeachingAssignmentId: 'hidden', responsibleTeacherUserId: 'hidden',
  ppctClassAssociationId: 'hidden', ppctPlanId: 'hidden', ppctVersionId: 'hidden', ppctItemId: 'hidden', ppctItemRevisionId: 'hidden',
  operationalLessonDispositionId: null, operationalDispositionType: null, fulfillmentExecutionId: 'hidden', fulfillmentKind: 'NORMAL',
  makeupTeachingScheduleId: null, executionCivilDate: '2026-08-18', executionAcademicCalendarVersionId: 'hidden',
  executionTimeSlotDefinitionId: 'hidden', actualTeacherUserId: 'hidden',
};

const passPreview = {
  previewAsOfInstant: '2026-08-29T01:00:00.000Z', status: 'PASS', responsibilityState: 'RESPONSIBILITY_PRESENT',
  eligibleForSubmission: true, counts, responsibilityManifest: [interval], findings: [],
  sections: [{ schoolClassId: CLASS_ID, subjectId: SUBJECT_ID, responsibilityIntervals: [interval], status: 'PASS', counts, details: [evidence], findings: [] }],
};

const pendingDetail = {
  revisionId: REVISION_ID, seriesId: 'hidden-series', statementProfile: 'hidden-profile', submitterUserId: 'hidden-user',
  submitterDisplayNameSnapshot: 'Nguyễn Văn An', submitterStaffCodeSnapshot: 'GV-018', academicYearId: YEAR_ID,
  fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', asOfInstant: '2026-08-29T01:00:00.000Z', submittedAt: '2026-08-29T01:01:00.000Z',
  lifecycleState: 'SUBMITTED', lifecycleToken: 'lifecycle-token-1', predecessorRevisionId: null, supersedesRevisionId: null,
  counts, sections: passPreview.sections, responsibilityManifest: [interval], frozenSubjectIds: [SUBJECT_ID], history: [], allowedActions: ['APPROVE', 'REJECT'],
};

function authWith(...capabilities: Array<{ key: string; scope: string; resourceId?: string }>) {
  return { ...normalAuth, capabilities };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function standardWorkspaceFetch(preview: unknown) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return jsonResponse(authWith({ key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' }));
    if (url.includes('workspace-context?academicYearId=')) return jsonResponse(workspaceSelected);
    if (url.endsWith('/workspace-context')) return jsonResponse(workspaceBase);
    if (url.endsWith('/preview')) return jsonResponse(preview);
    throw new Error(`Unexpected request ${url}`);
  });
}

async function fillAndPreview(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Báo cáo kê khai cá nhân' });
  await waitFor(() => expect(screen.getByLabelText('Năm học')).toHaveValue(YEAR_ID));
  await waitFor(() => expect(screen.getByLabelText('Từ ngày')).toBeEnabled());
  await user.type(screen.getByLabelText('Từ ngày'), '2026-08-01');
  await user.type(screen.getByLabelText('Đến ngày'), '2026-08-31');
  await user.click(screen.getByRole('button', { name: 'Xem trước báo cáo' }));
}

describe('Reporting Statement product UI', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('shows required date errors beside native date fields before preview', async () => {
    vi.stubGlobal('fetch', standardWorkspaceFetch(passPreview));
    const user = userEvent.setup();
    renderApp('/bao-cao-ke-khai');
    await screen.findByRole('heading', { name: 'Báo cáo kê khai cá nhân' });
    await waitFor(() => expect(screen.getByLabelText('Từ ngày')).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Xem trước báo cáo' }));
    expect(screen.getByText('Từ ngày là bắt buộc.')).toBeInTheDocument();
    expect(screen.getByText('Đến ngày là bắt buộc.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /bằng chứng xem trước/i })).not.toBeInTheDocument();
  });

  it('treats ZERO_RESPONSIBILITY as a successful zero result and prevents submit', async () => {
    vi.stubGlobal('fetch', standardWorkspaceFetch({ ...passPreview, responsibilityState: 'ZERO_RESPONSIBILITY', eligibleForSubmission: false, counts: { distributedElapsedCount: 0, completedCount: 0, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 }, sections: [], responsibilityManifest: [] }));
    const user = userEvent.setup();
    renderApp('/bao-cao-ke-khai');
    await fillAndPreview(user);
    expect(await screen.findByText(/không có trách nhiệm giảng dạy/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi báo cáo' })).toBeDisabled();
  });

  it('renders PASS labels and evidence, then invalidates preview when input changes', async () => {
    vi.stubGlobal('fetch', standardWorkspaceFetch(passPreview));
    const user = userEvent.setup();
    renderApp('/bao-cao-ke-khai');
    await fillAndPreview(user);
    expect(await screen.findByText(/12A3 — Lớp 12A3/)).toBeInTheDocument();
    expect(screen.getByText(/DIA — Địa lý/)).toBeInTheDocument();
    expect(screen.getByText('Thực hiện theo lịch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi báo cáo' })).toBeEnabled();
    await user.clear(screen.getByLabelText('Đến ngày'));
    await user.type(screen.getByLabelText('Đến ngày'), '2026-09-01');
    expect(screen.queryByRole('button', { name: 'Gửi báo cáo' })).not.toBeInTheDocument();
  });

  it('renders only public BLOCKED messages and hides internal finding identifiers', async () => {
    vi.stubGlobal('fetch', standardWorkspaceFetch({ ...passPreview, status: 'BLOCKED', eligibleForSubmission: false, counts: null, sections: [], responsibilityManifest: [], findings: [{ severity: 'BLOCKER', code: 'UPSTREAM_ALLOCATION_BLOCKED', message: 'Dữ liệu phân phối cần được kiểm tra.' }] }));
    const user = userEvent.setup();
    const { container } = renderApp('/bao-cao-ke-khai');
    await fillAndPreview(user);
    expect(await screen.findByText('Dữ liệu phân phối cần được kiểm tra.')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('UPSTREAM_ALLOCATION_BLOCKED');
    expect(container).not.toHaveTextContent(CLASS_ID);
    expect(screen.getByRole('button', { name: 'Gửi báo cáo' })).toBeDisabled();
  });

  it('reuses one submit requestKey after uncertain transport failure and creates a new key for a changed command', async () => {
    const keys = ['submit-key-1', 'submit-key-2'];
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => keys.shift() as `${string}-${string}-${string}-${string}-${string}`);
    const submitBodies: Array<Record<string, unknown>> = [];
    let submitAttempt = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(authWith({ key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' }));
      if (url.includes('workspace-context?academicYearId=')) return jsonResponse(workspaceSelected);
      if (url.endsWith('/workspace-context')) return jsonResponse(workspaceBase);
      if (url.endsWith('/preview')) return jsonResponse(passPreview);
      if (url.endsWith('/reporting-statements') && init?.method === 'POST') {
        submitBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        submitAttempt += 1;
        if (submitAttempt === 1) throw new TypeError('network uncertain');
        return jsonResponse({ revisionId: REVISION_ID, seriesId: 'hidden', lifecycleState: 'SUBMITTED', lifecycleToken: 'hidden', asOfInstant: '2026-08-29T01:00:00.000Z', replay: submitAttempt === 2 });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/bao-cao-ke-khai');
    await fillAndPreview(user);
    await user.click(await screen.findByRole('button', { name: 'Gửi báo cáo' }));
    await screen.findByRole('button', { name: 'Thử gửi lại' });
    expect(screen.queryByRole('button', { name: 'Gửi báo cáo' })).not.toBeInTheDocument();
    expect(randomUuid).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole('button', { name: 'Thử gửi lại' }));
    expect(await screen.findByText(/yêu cầu trước đó đã được hệ thống xác nhận/i)).toBeInTheDocument();
    expect(submitBodies[0].requestKey).toBe('submit-key-1');
    expect(submitBodies[1]).toEqual(submitBodies[0]);
    expect(randomUuid).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'Mở báo cáo vừa gửi' })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Đến ngày'));
    await user.type(screen.getByLabelText('Đến ngày'), '2026-09-30');
    await user.click(screen.getByRole('button', { name: 'Xem trước báo cáo' }));
    await user.click(await screen.findByRole('button', { name: 'Gửi báo cáo' }));
    await waitFor(() => expect(submitBodies).toHaveLength(3));
    expect(submitBodies[2].requestKey).toBe('submit-key-2');
    expect(randomUuid).toHaveBeenCalledTimes(2);
  });

  it('renders frozen detail without raw identifiers and requires confirmation before decision', async () => {
    const detail = {
      revisionId: REVISION_ID, seriesId: 'hidden-series', statementProfile: 'hidden-profile', submitterUserId: 'hidden-user',
      submitterDisplayNameSnapshot: 'Nguyễn Văn An', submitterStaffCodeSnapshot: 'GV-018', academicYearId: YEAR_ID,
      fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', asOfInstant: '2026-08-29T01:00:00.000Z', submittedAt: '2026-08-29T01:01:00.000Z',
      lifecycleState: 'SUBMITTED', lifecycleToken: 'hidden-lifecycle-token', predecessorRevisionId: null, supersedesRevisionId: null,
      counts, sections: passPreview.sections, responsibilityManifest: [interval], frozenSubjectIds: [SUBJECT_ID],
      history: [{ id: 'hidden-history-id', eventType: 'SUBMITTED', stateBefore: null, stateAfter: 'SUBMITTED', actorUserId: 'hidden-user', actorDisplayNameSnapshot: 'Nguyễn Văn An', actorStaffCodeSnapshot: 'GV-018', createdAt: '2026-08-29T01:01:00.000Z', causedByRevisionId: null }],
      allowedActions: ['APPROVE', 'REJECT'],
    };
    const decisionBodies: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('decision-key' as `${string}-${string}-${string}-${string}-${string}`);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(authWith({ key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' }));
      if (url.includes('/workspace-context?academicYearId=')) return jsonResponse(workspaceSelected);
      if (url.endsWith(`/reporting-statements/${REVISION_ID}`) && !init?.method) return jsonResponse(detail);
      if (url.endsWith('/approve')) { decisionBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>); return jsonResponse({ revisionId: REVISION_ID, seriesId: 'hidden', lifecycleState: 'APPROVED', lifecycleToken: 'new-hidden', asOfInstant: null, replay: false }); }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { container } = renderApp(`/bao-cao-ke-khai/${REVISION_ID}`);
    expect(await screen.findByRole('heading', { name: 'Chi tiết báo cáo kê khai' })).toBeInTheDocument();
    expect(screen.getByText('Bằng chứng chi tiết')).toBeInTheDocument();
    expect(container).not.toHaveTextContent(REVISION_ID);
    expect(container).not.toHaveTextContent('hidden-lifecycle-token');
    await user.click(screen.getByRole('button', { name: 'Phê duyệt báo cáo' }));
    expect(decisionBodies).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Xác nhận phê duyệt' }));
    await waitFor(() => expect(decisionBodies).toHaveLength(1));
    expect(decisionBodies[0]).toEqual({ expectedLifecycleToken: 'hidden-lifecycle-token', requestKey: 'decision-key' });
  });

  it('does not render decision controls when allowedActions is empty', async () => {
    const detail = {
      revisionId: REVISION_ID, seriesId: 'hidden', statementProfile: 'hidden', submitterUserId: 'hidden', submitterDisplayNameSnapshot: 'Nguyễn Văn An', submitterStaffCodeSnapshot: null,
      academicYearId: YEAR_ID, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', asOfInstant: '2026-08-29T01:00:00.000Z', submittedAt: '2026-08-29T01:01:00.000Z', lifecycleState: 'APPROVED', lifecycleToken: 'hidden', predecessorRevisionId: null, supersedesRevisionId: null,
      counts, sections: passPreview.sections, responsibilityManifest: [interval], frozenSubjectIds: [SUBJECT_ID], history: [], allowedActions: [],
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
      ? jsonResponse(authWith({ key: 'REPORTING_STATEMENT_READ', scope: 'PERSONAL' }))
      : String(input).includes('workspace-context') ? jsonResponse(workspaceSelected) : jsonResponse(detail)));
    renderApp(`/bao-cao-ke-khai/${REVISION_ID}`);
    expect(await screen.findByText('Đã phê duyệt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /phê duyệt báo cáo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /từ chối báo cáo/i })).not.toBeInTheDocument();
  });

  it('reuses the same decision requestKey and lifecycle token after an uncertain retry', async () => {
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('decision-retry-key' as `${string}-${string}-${string}-${string}-${string}`);
    const bodies: Array<Record<string, unknown>> = [];
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(authWith({ key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' }));
      if (url.includes('workspace-context')) return jsonResponse(workspaceSelected);
      if (url.endsWith(`/reporting-statements/${REVISION_ID}`) && !init?.method) return jsonResponse(pendingDetail);
      if (url.endsWith('/reject')) {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        attempts += 1;
        if (attempts === 1) throw new TypeError('network uncertain');
        return jsonResponse({ revisionId: REVISION_ID, seriesId: 'hidden', lifecycleState: 'REJECTED', lifecycleToken: 'new-hidden', asOfInstant: null, replay: true });
      }
      throw new Error(`Unexpected request ${url}`);
    }));
    const user = userEvent.setup();
    renderApp(`/bao-cao-ke-khai/${REVISION_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Từ chối báo cáo' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }));
    await screen.findByRole('button', { name: 'Thử lại cùng yêu cầu' });
    expect(screen.queryByRole('button', { name: 'Xác nhận từ chối' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Phê duyệt báo cáo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Từ chối báo cáo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại cùng yêu cầu' }));
    await screen.findByText(/yêu cầu từ chối trước đó/i);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual({ expectedLifecycleToken: 'lifecycle-token-1', requestKey: 'decision-retry-key' });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });

  it('keeps all decision controls hidden while a stale 409 refetch is pending', async () => {
    let detailReads = 0;
    let decisions = 0;
    const refreshedDetail = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(authWith({ key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' }));
      if (url.includes('workspace-context')) return jsonResponse(workspaceSelected);
      if (url.endsWith(`/reporting-statements/${REVISION_ID}`) && !init?.method) {
        detailReads += 1;
        return detailReads === 1 ? jsonResponse(pendingDetail) : refreshedDetail.promise;
      }
      if (url.endsWith('/approve')) {
        decisions += 1;
        return jsonResponse({ statusCode: 409, message: 'Báo cáo đã có trạng thái mới.' }, 409);
      }
      throw new Error(`Unexpected request ${url}`);
    }));
    const user = userEvent.setup();
    renderApp(`/bao-cao-ke-khai/${REVISION_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Phê duyệt báo cáo' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận phê duyệt' }));
    await waitFor(() => expect(detailReads).toBe(2));
    expect(await screen.findByText(/đang tải trạng thái mới/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /phê duyệt báo cáo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /từ chối báo cáo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xác nhận/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /thử lại cùng yêu cầu/i })).not.toBeInTheDocument();
    refreshedDetail.resolve(jsonResponse({ ...pendingDetail, lifecycleState: 'APPROVED', lifecycleToken: 'lifecycle-token-2', allowedActions: [] }));
    expect(await screen.findByText('Đã phê duyệt')).toBeInTheDocument();
    expect(decisions).toBe(1);
    expect(screen.queryByRole('button', { name: /thử lại cùng yêu cầu/i })).not.toBeInTheDocument();
  });

  it('keeps all decision controls hidden while a successful decision refetch is pending', async () => {
    let detailReads = 0;
    let decisions = 0;
    const refreshedDetail = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(authWith({ key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' }));
      if (url.includes('workspace-context')) return jsonResponse(workspaceSelected);
      if (url.endsWith(`/reporting-statements/${REVISION_ID}`) && !init?.method) {
        detailReads += 1;
        return detailReads === 1 ? jsonResponse(pendingDetail) : refreshedDetail.promise;
      }
      if (url.endsWith('/approve')) {
        decisions += 1;
        return jsonResponse({ revisionId: REVISION_ID, seriesId: 'hidden', lifecycleState: 'APPROVED', lifecycleToken: 'lifecycle-token-2', asOfInstant: null, replay: false });
      }
      throw new Error(`Unexpected request ${url}`);
    }));
    const user = userEvent.setup();
    renderApp(`/bao-cao-ke-khai/${REVISION_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Phê duyệt báo cáo' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận phê duyệt' }));
    await waitFor(() => expect(detailReads).toBe(2));
    expect(screen.queryByRole('button', { name: /phê duyệt báo cáo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /từ chối báo cáo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xác nhận/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /thử lại cùng yêu cầu/i })).not.toBeInTheDocument();
    refreshedDetail.resolve(jsonResponse({ ...pendingDetail, lifecycleState: 'APPROVED', lifecycleToken: 'lifecycle-token-2', allowedActions: [] }));
    expect(await screen.findByText('Đã phê duyệt')).toBeInTheDocument();
    expect(decisions).toBe(1);
  });
});
