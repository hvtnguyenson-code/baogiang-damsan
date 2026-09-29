import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CivilDateString,
  EffectiveScheduleComparisonResponse,
  EffectiveScheduleContextOptionsResponse,
  EffectiveScheduleTeacherOptionsResponse,
  IndividualWeeklyScheduleResponse,
  SchoolWideDayScheduleResponse,
} from '@baogiang/contracts';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

function authWith(...capabilities: Array<{ key: string; scope: string; resourceId?: string }>) {
  return { ...normalAuth, capabilities };
}

const mockContext: EffectiveScheduleContextOptionsResponse = {
  academicYears: [{ id: 'year-1', code: '2026-2027', name: 'Năm học 2026 - 2027' }],
  currentAcademicYearId: 'year-1',
  weeks: [
    {
      id: 'week-1',
      academicYearId: 'year-1',
      calendarVersionId: 'cal-1',
      weekNumber: 1,
      displayLabel: 'Tuần 1',
      startDate: '2026-09-07' as CivilDateString,
      endDate: '2026-09-12' as CivilDateString,
      kind: 'OFFICIAL',
    },
  ],
  currentAcademicWeekId: 'week-1',
  currentCivilDate: '2026-09-07' as CivilDateString,
};

const mockTeachers: EffectiveScheduleTeacherOptionsResponse = {
  items: [
    { userId: 'user-1', displayName: 'Nguyễn Văn An', code: 'GV01' },
    { userId: 'user-2', displayName: 'Trần Thị Bình', code: 'GV02' },
  ],
  page: 1,
  pageSize: 20,
  total: 2,
};

const mockMyWeekly: IndividualWeeklyScheduleResponse = {
  profile: 'SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1',
  academicYearId: 'year-1',
  academicWeekId: 'week-1',
  weekLabel: 'Tuần 1',
  teacherUserId: 'user-1',
  teacherDisplayName: 'Nguyễn Văn An',
  status: 'PASS',
  days: [
    {
      civilDate: '2026-09-07' as CivilDateString,
      weekday: 'MONDAY',
      isBlocked: false,
      slots: [
        {
          id: 'slot-1',
          civilDate: '2026-09-07' as CivilDateString,
          weekday: 'MONDAY',
          session: 'MORNING',
          timeSlotId: 'ts-1',
          slotLabel: 'Tiết 1',
          startTime: '07:00:00',
          endTime: '07:45:00',
          teacherUserId: 'user-1',
          teacherDisplayName: 'Nguyễn Văn An',
          occupancyState: 'OCCUPIED',
          sourceKind: 'BASE_TIMETABLE',
          sourceLabel: 'Lịch cơ sở',
          className: '10A1',
          subjectName: 'Toán',
        },
        {
          id: 'slot-2',
          civilDate: '2026-09-07' as CivilDateString,
          weekday: 'MONDAY',
          session: 'MORNING',
          timeSlotId: 'ts-2',
          slotLabel: 'Tiết 2',
          startTime: '07:45:00',
          endTime: '08:30:00',
          teacherUserId: 'user-1',
          teacherDisplayName: 'Nguyễn Văn An',
          occupancyState: 'FREE',
        },
      ],
    },
  ],
};

const mockSchoolWide: SchoolWideDayScheduleResponse = {
  profile: 'SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1',
  academicYearId: 'year-1',
  civilDate: '2026-09-07' as CivilDateString,
  weekday: 'MONDAY',
  status: 'PASS',
  slots: [
    { id: 'ts-1', label: 'Tiết 1', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
  ],
  teachers: [
    {
      teacherUserId: 'user-1',
      teacherDisplayName: 'Nguyễn Văn An',
      slots: [
        {
          id: 'slot-1',
          civilDate: '2026-09-07' as CivilDateString,
          weekday: 'MONDAY',
          session: 'MORNING',
          timeSlotId: 'ts-1',
          slotLabel: 'Tiết 1',
          startTime: '07:00:00',
          endTime: '07:45:00',
          teacherUserId: 'user-1',
          teacherDisplayName: 'Nguyễn Văn An',
          occupancyState: 'OCCUPIED',
          sourceKind: 'BASE_TIMETABLE',
          sourceLabel: 'Lịch cơ sở',
          className: '10A1',
          subjectName: 'Toán',
        },
      ],
    },
  ],
};

const mockComparison: EffectiveScheduleComparisonResponse = {
  profile: 'SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_V1',
  academicYearId: 'year-1',
  academicWeekId: 'week-1',
  selfTeacher: { userId: 'user-1', displayName: 'Nguyễn Văn An' },
  peerTeacher: { userId: 'user-2', displayName: 'Trần Thị Bình' },
  status: 'PASS',
  facts: [
    {
      civilDate: '2026-09-07' as CivilDateString,
      weekday: 'MONDAY',
      startTime: '07:00:00',
      endTime: '07:45:00',
      slotLabel: 'Tiết 1',
      comparisonState: 'SELF_BUSY_PEER_FREE',
      comparisonLabel: 'Tôi bận / Đồng nghiệp trống',
      selfOccupancy: {
        isBusy: true,
        sourceKind: 'BASE_TIMETABLE',
        sourceLabel: 'Lịch cơ sở',
        className: '10A1',
        subjectName: 'Toán',
      },
      peerOccupancy: {
        isBusy: false,
      },
    },
  ],
};

function setupFetchMock(customResponses: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(jsonResponse(authWith({ key: 'TEACHER_BASE', scope: 'PERSONAL' })));
    }
    if (url.includes('/api/effective-schedule/context')) {
      return Promise.resolve(jsonResponse(customResponses['context'] ?? mockContext));
    }
    if (url.includes('/api/effective-schedule/teachers')) {
      return Promise.resolve(jsonResponse(customResponses['teachers'] ?? mockTeachers));
    }
    if (url.includes('/api/effective-schedule/weekly') && url.includes('user-2')) {
      return Promise.resolve(jsonResponse(customResponses['peerWeekly'] ?? { ...mockMyWeekly, teacherUserId: 'user-2', teacherDisplayName: 'Trần Thị Bình' }));
    }
    if (url.includes('/api/effective-schedule/weekly')) {
      return Promise.resolve(jsonResponse(customResponses['weekly'] ?? mockMyWeekly));
    }
    if (url.includes('/api/effective-schedule/school-wide')) {
      return Promise.resolve(jsonResponse(customResponses['schoolWide'] ?? mockSchoolWide));
    }
    if (url.includes('/api/effective-schedule/compare')) {
      return Promise.resolve(jsonResponse(customResponses['compare'] ?? mockComparison));
    }
    return Promise.resolve(jsonResponse({}));
  }));
}

describe('EffectiveSchedulePage (Teacher Workspace UI)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('1 & 21. renders area named "Lịch dạy", defaults to "Lịch của tôi" and current week', async () => {
    setupFetchMock();
    renderApp('/lich-day');

    expect(await screen.findByRole('heading', { level: 1, name: 'Lịch dạy' })).toBeInTheDocument();
    expect(screen.getByText('Không gian làm việc giáo viên')).toBeInTheDocument();

    // Default heading shows Lịch của tôi
    expect(await screen.findByText(/Lịch của tôi — Nguyễn Văn An/i)).toBeInTheDocument();

    // Check week selector has Tuần 1 selected
    const weekSelect = screen.getByLabelText('Tuần học');
    expect(weekSelect).toHaveValue('week-1');

    // Slot 1 shows class 10A1 and Toán
    expect(screen.getByText('Lớp: 10A1')).toBeInTheDocument();
    expect(screen.getByText('Môn: Toán')).toBeInTheDocument();
    expect(screen.getByText('Lịch cơ sở')).toBeInTheDocument();

    // Slot 2 shows Trống
    expect(screen.getByText('Trống')).toBeInTheDocument();
  });

  it('4 & 5. blocks access for user without TEACHER_BASE or SYSTEM_ADMIN alone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        // SYSTEM_ADMIN only without TEACHER_BASE
        return Promise.resolve(jsonResponse(authWith({ key: 'SYSTEM_ADMIN', scope: 'SCHOOL_WIDE' })));
      }
      return Promise.resolve(jsonResponse({}));
    }));

    renderApp('/lich-day');
    expect(await screen.findByRole('heading', { name: /không có quyền/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Lịch dạy' })).not.toBeInTheDocument();
  });

  it('3 & 21. switches to "Toàn trường" mode and renders matrix', async () => {
    setupFetchMock();
    const user = userEvent.setup();
    renderApp('/lich-day');

    await screen.findByRole('heading', { level: 1, name: 'Lịch dạy' });

    const modeSelect = screen.getByLabelText('Phạm vi hiển thị');
    await user.selectOptions(modeSelect, 'school-wide');

    expect(await screen.findByRole('heading', { name: /Lịch toàn trường/i })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Nguyễn Văn An' })).toBeInTheDocument();
  });

  it('2, 17 & 21. selects a peer teacher and switches to "So sánh với lịch của tôi"', async () => {
    setupFetchMock();
    const user = userEvent.setup();
    renderApp('/lich-day');

    await screen.findByRole('heading', { level: 1, name: 'Lịch dạy' });

    // Switch to peer mode
    const modeSelect = screen.getByLabelText('Phạm vi hiển thị');
    await user.selectOptions(modeSelect, 'peer-schedule');

    // Select peer teacher
    const teacherSelect = await screen.findByLabelText('Danh sách giáo viên');
    await user.selectOptions(teacherSelect, 'user-2');

    // Click "So sánh với lịch của tôi"
    const compareBtn = await screen.findByRole('button', { name: 'So sánh với lịch của tôi' });
    await user.click(compareBtn);

    expect(await screen.findByRole('heading', { name: /So sánh lịch dạy: Tôi/i })).toBeInTheDocument();
    expect(screen.getByText('Tôi bận / Đồng nghiệp trống')).toBeInTheDocument();

    // Verify informational warning note is present and states no auto-swap
    expect(screen.getByText(/Hệ thống không kết luận và không tự động phân công đổi tiết, coi thay/i)).toBeInTheDocument();
  });

  it('16. structural BLOCKED state renders error alert and NEVER "Trống"', async () => {
    const blockedWeekly: IndividualWeeklyScheduleResponse = {
      ...mockMyWeekly,
      status: 'BLOCKED',
      blockedReasons: ['PPCT_ASSOCIATION_MISSING (loại: BLOCKER)'],
      days: [
        {
          civilDate: '2026-09-07' as CivilDateString,
          weekday: 'MONDAY',
          isBlocked: true,
          slots: [
            {
              id: 'slot-blocked',
              civilDate: '2026-09-07' as CivilDateString,
              weekday: 'MONDAY',
              session: 'MORNING',
              timeSlotId: 'ts-1',
              slotLabel: 'Tiết 1',
              startTime: '07:00:00',
              endTime: '07:45:00',
              teacherUserId: 'user-1',
              teacherDisplayName: 'Nguyễn Văn An',
              occupancyState: 'BLOCKED',
              notes: 'Không thể xác định do dữ liệu bị chặn',
            },
          ],
        },
      ],
    };

    setupFetchMock({ weekly: blockedWeekly });
    renderApp('/lich-day');

    // Alert rendered
    expect(await screen.findByText(/Lịch dạy đang ở trạng thái bị chặn/i)).toBeInTheDocument();
    expect(screen.getByText(/PPCT_ASSOCIATION_MISSING/i)).toBeInTheDocument();

    // CRITICAL: Must not render "Trống" for blocked date
    expect(screen.queryByText('Trống')).not.toBeInTheDocument();
    expect(screen.getByText(/Ngày học này không thể xác định lịch hiệu lực một cách nhất quán/i)).toBeInTheDocument();
    expect(screen.getByText(/Bị chặn \(Không thể xác định\)/i)).toBeInTheDocument();
  });

  it('20. maps Vietnamese labels and does not leak raw backend enums', async () => {
    setupFetchMock();
    renderApp('/lich-day');

    await screen.findByRole('heading', { level: 1, name: 'Lịch dạy' });

    // Assert that raw enums are NOT present in the document
    expect(screen.queryByText('BASE_TIMETABLE')).not.toBeInTheDocument();
    expect(screen.queryByText('OPERATIONAL_DISPOSITION')).not.toBeInTheDocument();
    expect(screen.queryByText('MAKEUP_TEACHING')).not.toBeInTheDocument();
    expect(screen.queryByText('SPECIAL_ACTIVITY')).not.toBeInTheDocument();
    expect(screen.queryByText('SAME_SUBJECT_SUBSTITUTION')).not.toBeInTheDocument();
    expect(screen.queryByText('DIFFERENT_SUBJECT_SUPERVISION')).not.toBeInTheDocument();

    // Assert localized label is present
    expect(screen.getByText('Lịch cơ sở')).toBeInTheDocument();
  });
});
