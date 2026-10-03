import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const operationAuth = {
  ...normalAuth,
  capabilities: [{ key: 'TEACHING_OPERATION_MANAGE' as const, scope: 'SCHOOL_WIDE' as const }],
};

const years = [
  { id: 'year-1', code: '2026-2027', name: 'Năm học 2026-2027' },
];

const mockCandidate = {
  sourceNormalOccurrenceKey: 'entry-1:2026-09-07:slot-1',
  originalCivilDate: '2026-09-07',
  originalTimeSlotDefinitionId: 'slot-1',
  originalTimeSlotName: 'Tiết 1',
  schoolClassId: 'class-1',
  schoolClassName: '10A1',
  subjectId: 'sub-1',
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
  originalTimetableEntryId: 'entry-1',
  originalCivilDate: '2026-09-07',
  originalAcademicCalendarVersionId: 'cal-1',
  originalTimeSlotDefinitionId: 'slot-1',
  schoolClassId: 'class-1',
  subjectId: 'sub-1',
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
  scheduledTeacherUserId: 'user-substitute-1',
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

function defaultFetch(options: {
  candidates?: typeof mockCandidate[];
  schedules?: typeof mockSchedule[];
} = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/auth/me')) return jsonResponse(operationAuth);
    if (url.includes('/academic-years?')) return jsonResponse({ items: years, page: 1, pageSize: 50, total: 1 });
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
    vi.stubGlobal('fetch', defaultFetch());
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: 'Lịch dạy bù' })).length).toBeGreaterThanOrEqual(1);
  });

  it('blocks /quan-tri/lich-day-bu route without TEACHING_OPERATION_MANAGE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(normalAuth)));
    renderApp('/quan-tri/lich-day-bu');
    expect(await screen.findByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeInTheDocument();
  });

  it('renders workspace with candidates and schedules', async () => {
    vi.stubGlobal('fetch', defaultFetch());
    renderApp('/quan-tri/lich-day-bu');

    expect(await screen.findByRole('heading', { name: 'Lịch dạy bù' })).toBeInTheDocument();
    expect(await screen.findByText('10A1')).toBeInTheDocument();
    expect(screen.getByText('Thầy Giáo Viên')).toBeInTheDocument();
    expect(screen.getByText('Khái niệm hàm số', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Vắng không người dạy thay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lập lịch bù' })).toBeInTheDocument();
  });

  it('selects candidate and creates make-up schedule', async () => {
    const fetchMock = defaultFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/lich-day-bu');

    const selectBtn = await screen.findByRole('button', { name: 'Lập lịch bù' });
    fireEvent.click(selectBtn);

    expect(screen.getByText('Thiết lập lịch dạy bù')).toBeInTheDocument();

    const dateInput = screen.getByLabelText(/ngày dạy bù dự kiến/i);
    const slotInput = screen.getByLabelText(/mã định danh tiết học/i);
    const teacherInput = screen.getByLabelText(/mã giáo viên thực hiện/i);

    fireEvent.change(dateInput, { target: { value: '2026-09-14' } });
    fireEvent.change(slotInput, { target: { value: 'slot-target-uuid' } });
    fireEvent.change(teacherInput, { target: { value: 'user-substitute-uuid' } });

    const submitBtn = screen.getByRole('button', { name: 'Xác nhận tạo lịch dạy bù' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/operational-overlays/makeup-schedules',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('slot-target-uuid'),
        }),
      );
    });
  });

  it('reverses active schedule', async () => {
    const fetchMock = defaultFetch();
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
