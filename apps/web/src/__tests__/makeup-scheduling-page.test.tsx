import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const ENTRY_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const CANONICAL_OCCURRENCE_KEY = `NORMAL:${ENTRY_UUID}:2026-09-07`;

const schoolWideAuth = {
  ...normalAuth,
  capabilities: [{ key: 'TEACHING_OPERATION_MANAGE' as const, scope: 'SCHOOL_WIDE' as const }],
};

const singleSubjectAuth = {
  ...normalAuth,
  capabilities: [
    { key: 'TEACHING_OPERATION_MANAGE' as const, scope: 'SUBJECT' as const, resourceId: 'sub-math-uuid' },
  ],
};

const multiSubjectAuth = {
  ...normalAuth,
  capabilities: [
    { key: 'TEACHING_OPERATION_MANAGE' as const, scope: 'SUBJECT' as const, resourceId: 'sub-math-uuid' },
    { key: 'TEACHING_OPERATION_MANAGE' as const, scope: 'SUBJECT' as const, resourceId: 'sub-phys-uuid' },
  ],
};

const years = [
  { id: 'year-1', code: '2026-2027', name: 'Năm học 2026-2027' },
];

const mockCandidate = {
  sourceNormalOccurrenceKey: CANONICAL_OCCURRENCE_KEY,
  originalCivilDate: '2026-09-07',
  originalTimeSlotDefinitionId: 'slot-1',
  originalTimeSlotName: 'Tiết 1',
  schoolClassId: 'class-1',
  schoolClassName: '10A1',
  subjectId: 'sub-math-uuid',
  subjectName: 'Toán học',
  responsibleTeacherUserId: 'user-teacher-1',
  responsibleTeacherName: 'Thầy Giáo Viên',
  sourceDispositionId: 'disp-1',
  dispositionType: 'ABSENCE_NO_REPLACEMENT',
  ppctItemId: 'ppct-item-1',
  ppctItemRevisionId: 'ppct-item-rev-1',
  ppctItemName: 'Khái niệm hàm số',
  ppctItemSequence: 1,
  hasActiveMakeupSchedule: false,
  activeMakeupScheduleId: null,
};

const mockSchedule = {
  id: 'schedule-1',
  academicYearId: 'year-1',
  originalTimetableVersionId: 'ver-1',
  originalTimetableEntryId: ENTRY_UUID,
  originalCivilDate: '2026-09-07',
  originalAcademicCalendarVersionId: 'cal-1',
  originalTimeSlotDefinitionId: 'slot-1',
  schoolClassId: 'class-1',
  subjectId: 'sub-math-uuid',
  originalTeachingAssignmentId: 'assign-1',
  responsibleTeacherUserId: 'user-teacher-1',
  ppctClassAssociationId: 'assoc-1',
  ppctPlanId: 'plan-1',
  ppctVersionId: 'pver-1',
  ppctItemId: 'ppct-item-1',
  sourceDispositionId: 'disp-1',
  targetCivilDate: '2026-09-14',
  targetAcademicCalendarVersionId: 'cal-1',
  targetTimeSlotDefinitionId: 'slot-5',
  scheduledTeacherUserId: 'user-substitute-uuid',
  eligibilityCheckedAt: '2026-09-07T08:00:00Z',
  eligibilityWasActive: true,
  eligibilityWasTeachingStaff: true,
  eligibilitySameSubject: true,
  eligibilityStaffSubjectId: 'ss-1',
  note: 'Dạy bù theo kế hoạch',
  status: 'ACTIVE',
  createRequestKey: 'req-1',
  reversedByUserId: null,
  reversedAt: null,
  reversalReason: null,
  replacesId: null,
  createdByUserId: 'user-admin',
  createdAt: '2026-09-07T08:00:00Z',
  updatedAt: '2026-09-07T08:00:00Z',
};

const mockTargetOptions = {
  academicYearId: 'year-1',
  targetCivilDate: '2026-09-14',
  targetWeekday: 'MONDAY',
  slots: [
    {
      id: 'slot-target-uuid',
      displayLabel: 'Tiết 5',
      session: 'AFTERNOON',
      ordinal: 5,
      startTime: '13:00:00',
      endTime: '13:45:00',
    },
  ],
  teachers: [
    {
      userId: 'user-substitute-uuid',
      displayName: 'Cô Giáo Viên Dạy Bù',
      staffCode: 'GV002',
    },
  ],
};

function createFetchMock(auth: unknown = schoolWideAuth, options: {
  candidates?: typeof mockCandidate[];
  candidateStatus?: 'PASS' | 'BLOCKED';
  candidateBlockedFindings?: string[];
  schedules?: typeof mockSchedule[];
} = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/auth/me')) return jsonResponse(auth);
    if (url.includes('/academic-years?')) return jsonResponse({ items: years, page: 1, pageSize: 50, total: 1 });
    if (url.includes('/makeup-schedules/target-options?')) {
      return jsonResponse(mockTargetOptions);
    }
    if (url.includes('/makeup-schedules/candidates?')) {
      return jsonResponse({
        status: options.candidateStatus ?? 'PASS',
        items: options.candidates ?? [mockCandidate],
        page: 1,
        pageSize: 50,
        total: (options.candidates ?? [mockCandidate]).length,
        blockedFindings: options.candidateBlockedFindings,
      });
    }
    if (url.includes('/makeup-schedules?') && method === 'GET') {
      return jsonResponse({
        items: options.schedules ?? [mockSchedule],
        page: 1,
        pageSize: 50,
        total: (options.schedules ?? [mockSchedule]).length,
        collisionCoverage: { hasInterruptionCollision: false, hasCalendarExceptionCollision: false, hasTimetableCollision: false, hasActiveScheduleCollision: false, hasSpecialActivityCollision: false },
      });
    }
    if (url.endsWith('/makeup-schedules') && method === 'POST') {
      return jsonResponse({
        outcome: 'CREATED',
        record: mockSchedule,
        collisionCoverage: { hasInterruptionCollision: false, hasCalendarExceptionCollision: false, hasTimetableCollision: false, hasActiveScheduleCollision: false, hasSpecialActivityCollision: false },
      }, 201);
    }
    if (url.includes('/reverse') && method === 'POST') {
      return jsonResponse({
        outcome: 'REVERSED',
        record: { ...mockSchedule, status: 'REVERSED', reversalReason: 'Lý do kiểm tra' },
        collisionCoverage: { hasInterruptionCollision: false, hasCalendarExceptionCollision: false, hasTimetableCollision: false, hasActiveScheduleCollision: false, hasSpecialActivityCollision: false },
      });
    }
    return jsonResponse({});
  });
}

describe('MakeupSchedulingPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders make-up scheduling link in navigation for TEACHING_OPERATION_MANAGE', async () => {
    vi.stubGlobal('fetch', createFetchMock());
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: 'Lịch dạy bù' })).length).toBeGreaterThanOrEqual(1);
  });

  it('blocks /quan-tri/lich-day-bu route without TEACHING_OPERATION_MANAGE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(normalAuth)));
    renderApp('/quan-tri/lich-day-bu');
    expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
  });

  it('renders workspace for SCHOOL_WIDE user and displays candidates and schedules', async () => {
    const fetchMock = createFetchMock(schoolWideAuth);
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/lich-day-bu');

    expect(await screen.findByRole('heading', { name: 'Lịch dạy bù' })).toBeInTheDocument();
    expect(await screen.findByText('10A1')).toBeInTheDocument();
    expect(screen.getByText('Thầy Giáo Viên')).toBeInTheDocument();
    expect(screen.getByText('Khái niệm hàm số', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Vắng không người dạy thay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lập lịch bù' })).toBeInTheDocument();

    // Verify candidates API called without subjectId constraint for SCHOOL_WIDE
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/operational-overlays\/makeup-schedules\/candidates\?academicYearId=year-1$/),
        expect.anything(),
      );
    });
  });

  it('renders workspace for single SUBJECT grant and automatically passes authorized subjectId', async () => {
    const fetchMock = createFetchMock(singleSubjectAuth);
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/lich-day-bu');

    expect(await screen.findByRole('heading', { name: 'Lịch dạy bù' })).toBeInTheDocument();
    expect(await screen.findByText('10A1')).toBeInTheDocument();

    // Verify candidates and schedules APIs called WITH subjectId
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('subjectId=sub-math-uuid'),
        expect.anything(),
      );
    });
  });

  it('renders subject selector for multi SUBJECT grants and filters accordingly', async () => {
    const fetchMock = createFetchMock(multiSubjectAuth);
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/lich-day-bu');

    expect(await screen.findByRole('heading', { name: 'Lịch dạy bù' })).toBeInTheDocument();
    const subjectSelect = await screen.findByLabelText(/môn học được phân công/i);
    expect(subjectSelect).toBeInTheDocument();

    // Switch subject
    fireEvent.change(subjectSelect, { target: { value: 'sub-phys-uuid' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('subjectId=sub-phys-uuid'),
        expect.anything(),
      );
    });
  });

  it('selects candidate, loads target options, and creates schedule with exact canonical source key and NO split coordinates', async () => {
    const fetchMock = createFetchMock(schoolWideAuth);
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/lich-day-bu');

    const selectBtn = await screen.findByRole('button', { name: 'Lập lịch bù' });
    fireEvent.click(selectBtn);

    expect(screen.getByText('Thiết lập lịch dạy bù')).toBeInTheDocument();

    // Choose target date
    const dateInput = screen.getByLabelText(/ngày dạy bù dự kiến/i);
    fireEvent.change(dateInput, { target: { value: '2026-09-14' } });

    // Wait for target-options to load dropdowns
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/target-options?'),
        expect.anything(),
      );
    });

    // Select options should now be present (not manual UUID text inputs)
    const slotSelect = await screen.findByLabelText(/tiết học mục tiêu/i);
    expect(slotSelect.tagName).toBe('SELECT');

    const teacherSelect = await screen.findByLabelText(/giáo viên thực hiện/i);
    expect(teacherSelect.tagName).toBe('SELECT');

    const submitBtn = screen.getByRole('button', { name: 'Xác nhận tạo lịch dạy bù' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).endsWith('/operational-overlays/makeup-schedules') && init?.method === 'POST',
      );
      expect(postCall).toBeDefined();

      const body = JSON.parse(postCall![1]!.body as string);

      // Verify exact canonical occurrence key is sent intact
      expect(body.sourceNormalOccurrenceKey).toBe(CANONICAL_OCCURRENCE_KEY);
      expect(body.targetCivilDate).toBe('2026-09-14');
      expect(body.targetTimeSlotDefinitionId).toBe('slot-target-uuid');
      expect(body.scheduledTeacherUserId).toBe('user-substitute-uuid');

      // Verify NO client PPCT/disposition coordinates or split IDs
      expect(body.sourceTimetableEntryId).toBeUndefined();
      expect(body.sourceDispositionId).toBeUndefined();
      expect(body.sourcePpctPlanId).toBeUndefined();
      expect(body.sourcePpctItemId).toBeUndefined();
      expect(body.ppctPlanId).toBeUndefined();
      expect(body.ppctVersionId).toBeUndefined();
      expect(body.ppctItemId).toBeUndefined();
      expect(body.ppctClassAssociationId).toBeUndefined();
    });
  });

  it('reverses active schedule', async () => {
    const fetchMock = createFetchMock(schoolWideAuth);
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/lich-day-bu');

    const reverseBtn = await screen.findByRole('button', { name: 'Đảo lịch' });
    fireEvent.click(reverseBtn);

    const reasonInput = screen.getByPlaceholderText(/lý do đảo lịch/i);
    fireEvent.change(reasonInput, { target: { value: 'Đảo lịch do thay đổi kế hoạch tuần' } });

    const confirmReverseBtn = screen.getByRole('button', { name: 'Xác nhận đảo' });
    fireEvent.click(confirmReverseBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/reverse'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Đảo lịch do thay đổi kế hoạch tuần'),
        }),
      );
    });
  });

  it('displays warning alert when candidates status is BLOCKED and prevents scheduling actions (CX-05)', async () => {
    const fetchMock = createFetchMock(schoolWideAuth, {
      candidateStatus: 'BLOCKED',
      candidates: [],
      candidateBlockedFindings: ['ROOT_BLOCKED:class-1:sub-math-uuid'],
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/lich-day-bu');

    expect(await screen.findByRole('heading', { name: 'Lịch dạy bù' })).toBeInTheDocument();
    // Warning banner is displayed
    expect(await screen.findByText(/Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn/i)).toBeInTheDocument();
    expect(screen.getByText(/ROOT_BLOCKED:class-1:sub-math-uuid/)).toBeInTheDocument();
    // Must NOT display empty-success
    expect(screen.queryByText(/Không có nghĩa vụ nợ tiết hợp lệ/i)).not.toBeInTheDocument();
    // Must NOT display "Lập lịch bù" button
    expect(screen.queryByRole('button', { name: 'Lập lịch bù' })).not.toBeInTheDocument();
  });

  it('displays true empty state when candidates status is PASS and debt items are empty (CX-05)', async () => {
    const fetchMock = createFetchMock(schoolWideAuth, {
      candidateStatus: 'PASS',
      candidates: [],
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/lich-day-bu');

    expect(await screen.findByRole('heading', { name: 'Lịch dạy bù' })).toBeInTheDocument();
    expect(await screen.findByText(/Không có nghĩa vụ nợ tiết hợp lệ/i)).toBeInTheDocument();
    expect(screen.queryByText(/Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn/i)).not.toBeInTheDocument();
  });

  it('retains and displays exact PPCT revision title (CX-06)', async () => {
    const customCandidate = {
      ...mockCandidate,
      ppctItemRevisionId: 'rev-historical-uuid',
      ppctItemName: 'Hình học giải tích — Bài 1 (Bản lưu trữ)',
      ppctItemSequence: 3,
    };
    const fetchMock = createFetchMock(schoolWideAuth, {
      candidates: [customCandidate],
      candidateStatus: 'PASS',
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/lich-day-bu');

    expect(await screen.findByText(/Hình học giải tích — Bài 1 \(Bản lưu trữ\)/)).toBeInTheDocument();
    expect(screen.getByText(/Tiết 3/)).toBeInTheDocument();
  });

  describe('AR-04: Candidate/schedule decoupling and fail-closed reload', () => {
    it('D1: initial PASS -> select candidate -> reload with candidates BLOCKED and schedules 503 => BLOCKED visible, old create form absent, submit impossible', async () => {
      let isReload = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/auth/me')) return jsonResponse(schoolWideAuth);
        if (url.includes('/academic-years?')) return jsonResponse({ items: years, page: 1, pageSize: 50, total: 1 });
        if (url.includes('/makeup-schedules/target-options?')) return jsonResponse(mockTargetOptions);

        if (url.includes('/makeup-schedules/candidates?')) {
          if (isReload) {
            return jsonResponse({
              status: 'BLOCKED',
              items: [],
              page: 1,
              pageSize: 50,
              total: 0,
              blockedFindings: ['AR04_FINDING_BLOCKED_D1'],
            });
          }
          return jsonResponse({
            status: 'PASS',
            items: [mockCandidate],
            page: 1,
            pageSize: 50,
            total: 1,
          });
        }

        if (url.includes('/makeup-schedules?') && method === 'GET') {
          if (isReload) {
            return jsonResponse({ message: 'Schedule database connection failed' }, 503);
          }
          return jsonResponse({
            items: [mockSchedule],
            page: 1,
            pageSize: 50,
            total: 1,
            collisionCoverage: { hasInterruptionCollision: false, hasCalendarExceptionCollision: false, hasTimetableCollision: false, hasActiveScheduleCollision: false, hasSpecialActivityCollision: false },
          });
        }

        return jsonResponse({});
      });

      vi.stubGlobal('fetch', fetchMock);
      renderApp('/quan-tri/lich-day-bu');

      // Select candidate
      const selectBtn = await screen.findByRole('button', { name: 'Lập lịch bù' });
      fireEvent.click(selectBtn);
      expect(screen.getByText('Thiết lập lịch dạy bù')).toBeInTheDocument();

      // Trigger reload with candidates BLOCKED and schedules 503
      isReload = true;
      const reloadBtn = screen.getByRole('button', { name: 'Tải lại danh sách' });
      fireEvent.click(reloadBtn);

      // Verify BLOCKED warning visible
      expect(await screen.findByText(/Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn/i)).toBeInTheDocument();
      expect(screen.getByText(/AR04_FINDING_BLOCKED_D1/)).toBeInTheDocument();

      // Verify schedule error is surfaced separately
      expect(screen.getByText(/Lỗi tải danh sách lịch dạy bù/i)).toBeInTheDocument();

      // Verify old create form absent and submit impossible
      expect(screen.queryByText('Thiết lập lịch dạy bù')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Xác nhận tạo lịch dạy bù/i })).not.toBeInTheDocument();
    });

    it('D2: initial PASS -> selected candidate -> candidate request 503 => old candidate becomes non-actionable', async () => {
      let isReload = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/auth/me')) return jsonResponse(schoolWideAuth);
        if (url.includes('/academic-years?')) return jsonResponse({ items: years, page: 1, pageSize: 50, total: 1 });

        if (url.includes('/makeup-schedules/candidates?')) {
          if (isReload) {
            return jsonResponse({ message: 'Candidate lookup service unavailable' }, 503);
          }
          return jsonResponse({
            status: 'PASS',
            items: [mockCandidate],
            page: 1,
            pageSize: 50,
            total: 1,
          });
        }

        if (url.includes('/makeup-schedules?') && method === 'GET') {
          return jsonResponse({
            items: [mockSchedule],
            page: 1,
            pageSize: 50,
            total: 1,
            collisionCoverage: { hasInterruptionCollision: false, hasCalendarExceptionCollision: false, hasTimetableCollision: false, hasActiveScheduleCollision: false, hasSpecialActivityCollision: false },
          });
        }

        return jsonResponse({});
      });

      vi.stubGlobal('fetch', fetchMock);
      renderApp('/quan-tri/lich-day-bu');

      // Select candidate
      const selectBtn = await screen.findByRole('button', { name: 'Lập lịch bù' });
      fireEvent.click(selectBtn);
      expect(screen.getByText('Thiết lập lịch dạy bù')).toBeInTheDocument();

      // Trigger reload where candidates fails with 503
      isReload = true;
      const reloadBtn = screen.getByRole('button', { name: 'Tải lại danh sách' });
      fireEvent.click(reloadBtn);

      // Verify candidate error alert is visible
      expect(await screen.findByText(/Lỗi tải danh sách nghĩa vụ dạy bù/i)).toBeInTheDocument();

      // Old candidate form is cleared and submit button is absent
      expect(screen.queryByText('Thiết lập lịch dạy bù')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Xác nhận tạo lịch dạy bù/i })).not.toBeInTheDocument();
    });

    it('D3: candidates BLOCKED -> schedules delayed/fails later => BLOCKED applied independently before/finally despite schedule error', async () => {
      let resolveSchedules!: (val: Response) => void;
      const schedulesDeferred = new Promise<Response>((resolve) => {
        resolveSchedules = resolve;
      });

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/auth/me')) return jsonResponse(schoolWideAuth);
        if (url.includes('/academic-years?')) return jsonResponse({ items: years, page: 1, pageSize: 50, total: 1 });

        if (url.includes('/makeup-schedules/candidates?')) {
          // Candidates returns BLOCKED immediately
          return jsonResponse({
            status: 'BLOCKED',
            items: [],
            page: 1,
            pageSize: 50,
            total: 0,
            blockedFindings: ['AR04_FINDING_BLOCKED_D3'],
          });
        }

        if (url.includes('/makeup-schedules?') && method === 'GET') {
          // Schedules is held pending
          return schedulesDeferred;
        }

        return jsonResponse({});
      });

      vi.stubGlobal('fetch', fetchMock);
      renderApp('/quan-tri/lich-day-bu');

      // BLOCKED is applied independently and immediately before schedules promise settles
      expect(await screen.findByText(/Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn/i)).toBeInTheDocument();
      expect(screen.getByText(/AR04_FINDING_BLOCKED_D3/)).toBeInTheDocument();

      // Schedules fails later with 503
      resolveSchedules(jsonResponse({ message: 'Schedules timed out' }, 503));

      // Schedule error is displayed separately, and BLOCKED state remains intact
      expect(await screen.findByText(/Lỗi tải danh sách lịch dạy bù/i)).toBeInTheDocument();
      expect(screen.getByText(/Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Lập lịch bù' })).not.toBeInTheDocument();
    });

    it('D4: candidates PASS -> schedules 503 => candidate PASS behavior remains deterministic and schedule error displayed separately', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/auth/me')) return jsonResponse(schoolWideAuth);
        if (url.includes('/academic-years?')) return jsonResponse({ items: years, page: 1, pageSize: 50, total: 1 });

        if (url.includes('/makeup-schedules/candidates?')) {
          return jsonResponse({
            status: 'PASS',
            items: [mockCandidate],
            page: 1,
            pageSize: 50,
            total: 1,
          });
        }

        if (url.includes('/makeup-schedules?') && method === 'GET') {
          return jsonResponse({ message: 'Internal schedule query error' }, 503);
        }

        return jsonResponse({});
      });

      vi.stubGlobal('fetch', fetchMock);
      renderApp('/quan-tri/lich-day-bu');

      // Candidate PASS is rendered deterministically
      const selectBtn = await screen.findByRole('button', { name: 'Lập lịch bù' });
      expect(selectBtn).toBeInTheDocument();
      expect(screen.queryByText(/Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn/i)).not.toBeInTheDocument();

      // Schedule error is displayed separately
      expect(await screen.findByText(/Lỗi tải danh sách lịch dạy bù/i)).toBeInTheDocument();

      // Action remains possible on the verified candidate
      fireEvent.click(selectBtn);
      expect(screen.getByText('Thiết lập lịch dạy bù')).toBeInTheDocument();
    });

    it('D5: overlapping reload: request A old context delayed, request B new context completes, then A completes => A cannot overwrite B state', async () => {
      let resolveCandidateA!: (val: Response) => void;
      const candidateADeferred = new Promise<Response>((resolve) => {
        resolveCandidateA = resolve;
      });

      let candidateCallCount = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/auth/me')) return jsonResponse(schoolWideAuth);
        if (url.includes('/academic-years?')) return jsonResponse({ items: years, page: 1, pageSize: 50, total: 1 });

        if (url.includes('/makeup-schedules/candidates?')) {
          candidateCallCount++;
          if (candidateCallCount === 1) {
            // Initial load
            return jsonResponse({
              status: 'PASS',
              items: [mockCandidate],
              page: 1,
              pageSize: 50,
              total: 1,
            });
          }
          if (candidateCallCount === 2) {
            // Request A: delayed
            return candidateADeferred;
          }
          // Request B: completes fast with BLOCKED
          return jsonResponse({
            status: 'BLOCKED',
            items: [],
            page: 1,
            pageSize: 50,
            total: 0,
            blockedFindings: ['AR04_FINDING_BLOCKED_FROM_REQUEST_B'],
          });
        }

        if (url.includes('/makeup-schedules?') && method === 'GET') {
          return jsonResponse({
            items: [mockSchedule],
            page: 1,
            pageSize: 50,
            total: 1,
            collisionCoverage: { hasInterruptionCollision: false, hasCalendarExceptionCollision: false, hasTimetableCollision: false, hasActiveScheduleCollision: false, hasSpecialActivityCollision: false },
          });
        }

        return jsonResponse({});
      });

      vi.stubGlobal('fetch', fetchMock);
      renderApp('/quan-tri/lich-day-bu');

      // Initial load PASS
      expect(await screen.findByRole('button', { name: 'Lập lịch bù' })).toBeInTheDocument();

      const subjectSelect = screen.getByLabelText(/Lọc theo môn học/i);

      // Trigger Request A (slow) by switching subject
      fireEvent.change(subjectSelect, { target: { value: 'sub-math-uuid' } });

      // Trigger Request B immediately while A is pending by switching subject again
      fireEvent.change(subjectSelect, { target: { value: '' } });

      // Request B completes immediately -> BLOCKED state shown
      expect(await screen.findByText(/Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn/i)).toBeInTheDocument();
      expect(screen.getByText(/AR04_FINDING_BLOCKED_FROM_REQUEST_B/)).toBeInTheDocument();

      // Now Request A completes with old PASS data
      resolveCandidateA(jsonResponse({
        status: 'PASS',
        items: [mockCandidate],
        page: 1,
        pageSize: 50,
        total: 1,
      }));

      // Wait a moment and verify Request A did NOT overwrite Request B's BLOCKED state
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByText(/Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn/i)).toBeInTheDocument();
      expect(screen.getByText(/AR04_FINDING_BLOCKED_FROM_REQUEST_B/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Lập lịch bù' })).not.toBeInTheDocument();
    });

    it('D6: BLOCKED response clears old target options and replacement selection', async () => {
      const reversedSchedule = {
        ...mockSchedule,
        id: 'schedule-reversed-99',
        status: 'REVERSED',
        reversalReason: 'Đổi kế hoạch tuần trước',
      };

      let isBlocked = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.endsWith('/auth/me')) return jsonResponse(schoolWideAuth);
        if (url.includes('/academic-years?')) return jsonResponse({ items: years, page: 1, pageSize: 50, total: 1 });
        if (url.includes('/makeup-schedules/target-options?')) return jsonResponse(mockTargetOptions);

        if (url.includes('/makeup-schedules/candidates?')) {
          if (isBlocked) {
            return jsonResponse({
              status: 'BLOCKED',
              items: [],
              page: 1,
              pageSize: 50,
              total: 0,
              blockedFindings: ['AR04_BLOCKED_CLEARS_OPTIONS'],
            });
          }
          return jsonResponse({
            status: 'PASS',
            items: [mockCandidate],
            page: 1,
            pageSize: 50,
            total: 1,
          });
        }

        if (url.includes('/makeup-schedules?') && method === 'GET') {
          return jsonResponse({
            items: [reversedSchedule],
            page: 1,
            pageSize: 50,
            total: 1,
            collisionCoverage: { hasInterruptionCollision: false, hasCalendarExceptionCollision: false, hasTimetableCollision: false, hasActiveScheduleCollision: false, hasSpecialActivityCollision: false },
          });
        }

        return jsonResponse({});
      });

      vi.stubGlobal('fetch', fetchMock);
      renderApp('/quan-tri/lich-day-bu');

      // Click "Tạo lịch thay thế" on reversed schedule
      const replaceBtn = await screen.findByRole('button', { name: 'Tạo lịch thay thế' });
      fireEvent.click(replaceBtn);

      expect(screen.getByText(/Tạo lịch thay thế cho lịch đã đảo \(schedule-reversed-99\)/i)).toBeInTheDocument();

      // Enter target date to trigger target-options load
      const dateInput = screen.getByLabelText(/ngày dạy bù dự kiến/i);
      fireEvent.change(dateInput, { target: { value: '2026-09-14' } });

      await waitFor(() => {
        expect(screen.getByLabelText(/tiết học mục tiêu/i)).toBeInTheDocument();
      });

      // Now trigger reload with BLOCKED
      isBlocked = true;
      const reloadBtn = screen.getByRole('button', { name: 'Tải lại danh sách' });
      fireEvent.click(reloadBtn);

      // Verify BLOCKED banner is displayed
      expect(await screen.findByText(/Chưa thể xác định đầy đủ nghĩa vụ dạy bù do dữ liệu nguồn đang bị chặn/i)).toBeInTheDocument();

      // Replacement form is completely removed
      expect(screen.queryByText(/Tạo lịch thay thế cho lịch đã đảo/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/tiết học mục tiêu/i)).not.toBeInTheDocument();

      // And "Tạo lịch thay thế" button is disabled while BLOCKED
      expect(screen.getByRole('button', { name: 'Tạo lịch thay thế' })).toBeDisabled();
    });
  });
});
