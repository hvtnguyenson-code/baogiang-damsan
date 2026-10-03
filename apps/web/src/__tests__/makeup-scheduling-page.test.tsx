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
      return jsonResponse({ items: options.candidates ?? [mockCandidate], page: 1, pageSize: 50, total: 1 });
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
});
