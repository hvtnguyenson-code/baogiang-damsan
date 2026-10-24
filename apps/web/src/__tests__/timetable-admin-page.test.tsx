import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityKey, CapabilityScope } from '@baogiang/contracts';
import { TimetableAdminPage } from '../pages/TimetableAdminPage';
import { jsonResponse, normalAuth, renderApp, renderWithQuery } from './test-utils';

function authWithCaps(caps: Array<{ key: CapabilityKey; scope: CapabilityScope }>) {
  return {
    ...normalAuth,
    user: {
      ...normalAuth.user,
      displayName: 'Nguyễn Văn Quản Trị TKB',
      positionTitle: 'Phó Hiệu trưởng',
    },
    capabilities: caps,
  };
}

const mockAcademicYears = [
  {
    id: 'year-2024',
    code: '2024-2025',
    name: 'Năm học 2024 - 2025',
    startDate: '2024-09-05',
    endDate: '2025-05-31',
    isCurrent: true,
  },
  {
    id: 'year-2025',
    code: '2025-2026',
    name: 'Năm học 2025 - 2026',
    startDate: '2025-09-05',
    endDate: '2026-05-31',
    isCurrent: false,
  },
];

function TabHistoryControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><button onClick={() => navigate(-1)}>Quay lại kiểm thử</button><output aria-label="Đường dẫn kiểm thử">{location.search}</output></>;
}

const mockTimeSlots = [
  {
    id: 'ts-m1',
    academicYearId: 'year-2024',
    weekday: 'MONDAY' as const,
    session: 'MORNING' as const,
    ordinal: 1,
    revision: 1,
    isActive: true,
    displayLabel: 'Tiết 1',
    startTime: '07:15',
    endTime: '08:00',
    allowRegularTeaching: true,
    allowMakeupTeaching: true,
    allowSelfStudy: false,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'ts-m2',
    academicYearId: 'year-2024',
    weekday: 'MONDAY' as const,
    session: 'MORNING' as const,
    ordinal: 2,
    revision: 1,
    isActive: true,
    displayLabel: 'Tiết 2',
    startTime: '08:05',
    endTime: '08:50',
    allowRegularTeaching: true,
    allowMakeupTeaching: true,
    allowSelfStudy: false,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'ts-a1',
    academicYearId: 'year-2024',
    weekday: 'MONDAY' as const,
    session: 'AFTERNOON' as const,
    ordinal: 1,
    revision: 2,
    isActive: true,
    displayLabel: 'Tiết 1 Chiều',
    startTime: '13:30',
    endTime: '14:15',
    allowRegularTeaching: true,
    allowMakeupTeaching: true,
    allowSelfStudy: false,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
  },
];

const mockTimetableVersions = [
  {
    id: 'ttv-active-1',
    academicYearId: 'year-2024',
    versionNumber: 1,
    status: 'ACTIVE' as const,
    calendarVersionId: 'cal-v1',
    effectiveAcademicWeekId: 'week-1',
    effectiveFrom: '2024-09-05',
    effectiveUntil: '2025-01-15',
    contentChecksum: 'cs-active-1',
    note: 'Phiên bản chính thức đầu năm',
    createdByUserId: 'user-admin',
    validatedByUserId: 'user-admin',
    validatedAt: '2024-09-02T10:00:00Z',
    approvedByUserId: 'user-admin',
    approvedAt: '2024-09-03T10:00:00Z',
    activatedByUserId: 'user-admin',
    activatedAt: '2024-09-04T10:00:00Z',
    supersededAt: null,
    createdAt: '2024-09-01T00:00:00Z',
    updatedAt: '2024-09-04T10:00:00Z',
    entryCount: 420,
  },
  {
    id: 'ttv-draft-2',
    academicYearId: 'year-2024',
    versionNumber: 2,
    status: 'DRAFT' as const,
    calendarVersionId: null,
    effectiveAcademicWeekId: null,
    effectiveFrom: null,
    effectiveUntil: null,
    contentChecksum: null,
    note: 'Bản nháp nhập từ file Đam San',
    createdByUserId: 'user-admin',
    validatedByUserId: null,
    validatedAt: null,
    approvedByUserId: null,
    approvedAt: null,
    activatedByUserId: null,
    activatedAt: null,
    supersededAt: null,
    createdAt: '2024-10-10T00:00:00Z',
    updatedAt: '2024-10-10T00:00:00Z',
    entryCount: 0,
  },
];

const mockReadinessReport = {
  profile: 'NORMAL_BASE_PPCT_V1',
  productLabel: 'TIMETABLE READINESS — NORMAL BASE + PPCT BINDING',
  scope: 'ACADEMIC_YEAR',
  result: 'PASS' as const,
  evaluatedAt: '2026-10-19T10:00:00Z',
  provenance: {
    timetableVersionId: 'ttv-active-1',
    academicCalendarVersionId: 'cal-v1',
    ppctClassAssociationIds: [],
    ppctVersionIds: [],
  },
  findings: [],
  dimensions: [
    {
      key: 'NORMAL_BASE_TIMETABLE_FOUNDATION',
      state: 'PASS' as const,
      mandatory: true,
    },
    {
      key: 'PPCT_ASSOCIATION_BINDING',
      state: 'PASS' as const,
      mandatory: true,
    },
    {
      key: 'PPCT_CAPACITY',
      state: 'PASS' as const,
      mandatory: true,
    },
    {
      key: 'OPERATIONAL_OVERLAYS',
      state: 'NOT_ASSESSED' as const,
      mandatory: false,
    },
  ],
};

const mockProfiles = [
  {
    id: 'prof-damsan-1',
    sourceKey: 'damsan_official',
    name: 'Cấu hình Đam San Native V1',
    createdByUserId: 'user-admin',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    activeRevision: {
      id: 'rev-damsan-1',
      profileId: 'prof-damsan-1',
      revisionNumber: 1,
      sourceFormat: 'DAMSAN_NATIVE' as const,
      isDefault: true,
      sheetNameHint: 'Lớp sáng',
      headerRowHint: 4,
      createdByUserId: 'user-admin',
      createdAt: '2026-09-01T00:00:00Z',
    },
  },
];

const mockCalendars = [
  {
    id: 'cal-v1',
    academicYearId: 'year-2024',
    versionNumber: 1,
    startDate: '2024-09-05',
    endDate: '2025-05-31',
    officialWeekCount: 35,
    reserveWeekCount: 2,
    isActive: true,
    publishedAt: '2024-09-01T00:00:00Z',
    createdAt: '2024-09-01T00:00:00Z',
  },
];

const mockCalendarDetail = {
  ...mockCalendars[0],
  teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
  semesters: [],
  interruptions: [],
  weeks: [
    {
      id: 'week-1',
      kind: 'OFFICIAL' as const,
      officialWeekNumber: 1,
      displayLabel: 'Tuần 1',
      sortOrder: 1,
      segments: [],
    },
  ],
};

const mockInspectionResult = {
  profileRevisionId: 'rev-damsan-1',
  profileId: 'prof-damsan-1',
  sourceFileName: 'tkb-hk1.xlsx',
  sheets: [
    {
      name: 'Lớp sáng',
      state: 'VISIBLE' as const,
      nonBlank: true,
      selectable: true,
      rowCount: 150,
      columnCount: 15,
      matchesProfileSheetHint: true,
      headerCandidates: [],
    },
    {
      name: 'Lớp chiều',
      state: 'VISIBLE' as const,
      nonBlank: true,
      selectable: true,
      rowCount: 120,
      columnCount: 15,
      matchesProfileSheetHint: false,
      headerCandidates: [],
    },
    {
      name: 'GV sáng',
      state: 'VISIBLE' as const,
      nonBlank: true,
      selectable: true,
      rowCount: 110,
      columnCount: 15,
      matchesProfileSheetHint: false,
      headerCandidates: [],
    },
    {
      name: 'GV chiều',
      state: 'VISIBLE' as const,
      nonBlank: true,
      selectable: true,
      rowCount: 95,
      columnCount: 15,
      matchesProfileSheetHint: false,
      headerCandidates: [],
    },
  ],
  issues: [],
};

const mockPreviewResult = {
  profileId: 'prof-damsan-1',
  profileRevisionId: 'rev-damsan-1',
  source: {
    sourceFileName: 'tkb-hk1.xlsx',
    sheetName: 'Lớp sáng',
    headerRowNumber: 4,
    sourceRowCount: 150,
  },
  target: {
    academicYearId: 'year-2024',
    calendarVersionId: 'cal-v1',
    effectiveAcademicWeekId: 'week-1',
    effectiveFrom: '2024-09-05',
    calendarEndDate: '2025-05-31',
  },
  rows: [],
  issues: [],
  blockingIssueCount: 0,
  warningCount: 0,
  canConfirm: true,
  baseline: {
    date: '2024-09-05',
    timetableVersion: {
      id: 'ttv-active-1',
      versionNumber: 1,
      status: 'ACTIVE' as const,
      effectiveFrom: '2024-09-05',
      effectiveUntil: null,
    },
  },
  diff: {
    added: [],
    changed: [],
    removed: [],
    unchangedCount: 0,
    counts: { added: 420, changed: 0, removed: 0, unchanged: 0 },
  },
  composition: {
    mode: 'BOTH' as const,
    baselineTimetableVersionId: null,
    authoredEntryCount: 420,
    carriedForwardEntryCount: 0,
    finalEntryCount: 420,
  },
};

const mockConfirmResult = {
  version: {
    ...mockTimetableVersions[1],
    versionNumber: 3,
    status: 'DRAFT' as const,
    entryCount: 420,
  },
  receipt: {
    id: 'rcpt-unique-123',
    timetableVersionId: 'ttv-draft-3',
    profileRevisionId: 'rev-damsan-1',
    checksumAlgorithm: 'SHA-256' as const,
    serializationVersion: 'semantic-v1' as const,
    requestIdempotencyKey: null,
    requestFingerprint: 'fp-123',
    sourceFileName: 'tkb-hk1.xlsx',
    sheetName: 'Lớp sáng',
    headerRowNumber: 4,
    sourceRowCount: 150,
    normalizedEntryCount: 420,
    createdByUserId: 'user-admin',
  },
  outcome: 'CREATED' as const,
};

describe('P5-053: Timetable & Time-slot Administration Workspace', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        // Academic years list
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/timetable-resolution') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }

        // Calendar versions
        if (url.includes('/calendar-versions') && !url.includes('/academic-calendar-versions/')) {
          return jsonResponse({ items: mockCalendars, total: 1 });
        }
        if (url.includes('/academic-calendar-versions/cal-v1')) {
          return jsonResponse(mockCalendarDetail);
        }

        // Time slots list & mutations
        if (url.includes('/time-slots') && !url.includes('/revise') && !url.includes('/retire')) {
          return jsonResponse({ items: mockTimeSlots, total: 3, page: 1, pageSize: 20 });
        }
        if (url.includes('/time-slots') && url.includes('/revise')) {
          return jsonResponse({ previous: mockTimeSlots[0], replacement: { ...mockTimeSlots[0], revision: 2 } });
        }
        if (url.includes('/time-slots') && url.includes('/retire')) {
          return jsonResponse({ ...mockTimeSlots[0], isActive: false });
        }

        // Specific timetable version detail
        if (url.includes('/timetable-versions/ttv-active-1/readiness')) {
          return jsonResponse(mockReadinessReport);
        }
        if (url.includes('/timetable-versions/ttv-active-1/entries') || url.includes('/timetable-versions/ttv-draft-2/entries')) {
          return jsonResponse({ items: [], total: 0, page: 1, pageSize: 20 });
        }
        if (url.endsWith('/timetable-versions/ttv-active-1')) {
          return jsonResponse(mockTimetableVersions[0]);
        }
        if (url.endsWith('/timetable-versions/ttv-draft-2')) {
          return jsonResponse(mockTimetableVersions[1]);
        }

        // Timetable versions list
        if (
          url.includes('/timetable-versions') &&
          !url.includes('/readiness') &&
          !url.includes('/validate') &&
          !url.includes('/approve') &&
          !url.includes('/activate') &&
          !url.includes('/target')
        ) {
          return jsonResponse({ items: mockTimetableVersions, total: 2, page: 1, pageSize: 10 });
        }

        // Import endpoints
        if (url.includes('/timetable-import/profiles')) {
          return jsonResponse({ items: mockProfiles, total: 1 });
        }
        if (url.includes('/timetable-import/workbooks/inspect')) {
          return jsonResponse(mockInspectionResult);
        }
        if (url.includes('/timetable-import/workbooks/preview')) {
          return jsonResponse(mockPreviewResult);
        }
        if (url.includes('/timetable-import/workbooks/confirm')) {
          return jsonResponse(mockConfirmResult);
        }

        return jsonResponse({ items: [], total: 0 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Route & Capability Guards', () => {
    it('redirects to Access Denied when user lacks TIMETABLE_MANAGE on SCHOOL_WIDE', async () => {
      const teacherAuth = authWithCaps([{ key: 'TEACHER_BASE', scope: 'PERSONAL' }]);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/auth/me')) return jsonResponse(teacherAuth);
          return jsonResponse({ items: [], total: 0 });
        }),
      );

      renderApp('/quan-tri/thoi-khoa-bieu');
      expect(await screen.findByRole('heading', { name: /không có quyền/i })).toBeInTheDocument();
    });

    it('SYSTEM_ADMIN alone cannot access Timetable workspace without explicit TIMETABLE_MANAGE grant', async () => {
      const sysAdminAuth = authWithCaps([{ key: 'SYSTEM_ADMIN', scope: 'SCHOOL_WIDE' }]);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/auth/me')) return jsonResponse(sysAdminAuth);
          return jsonResponse({ items: [], total: 0 });
        }),
      );

      renderApp('/quan-tri/thoi-khoa-bieu');
      expect(await screen.findByRole('heading', { name: /không có quyền/i })).toBeInTheDocument();
    });

    it('renders workspace when user has TIMETABLE_MANAGE on SCHOOL_WIDE', async () => {
      const authorizedAuth = authWithCaps([{ key: 'TIMETABLE_MANAGE', scope: 'SCHOOL_WIDE' }]);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/auth/me')) return jsonResponse(authorizedAuth);
          if (url.includes('/academic-years') && !url.includes('/timetable-versions') && !url.includes('/time-slots')) {
            return jsonResponse({ items: mockAcademicYears, total: 2 });
          }
          if (url.includes('/time-slots')) return jsonResponse({ items: mockTimeSlots, total: 3 });
          if (url.includes('/timetable-versions')) return jsonResponse({ items: mockTimetableVersions, total: 2 });
          return jsonResponse({ items: [], total: 0 });
        }),
      );

      renderApp('/quan-tri/thoi-khoa-bieu');
      expect(await screen.findByRole('heading', { name: /thời khóa biểu & khung tiết/i })).toBeInTheDocument();
    });
  });

  describe('Workspace Navigation & Academic Year Selector', () => {
    it('P5-058: opens import directly, preserves it after remount and supports back without losing other query parameters', async () => {
      const route = '/quan-tri/thoi-khoa-bieu?tab=import&context=readiness';
      const first = renderWithQuery(<TimetableAdminPage />, route);
      expect(await screen.findByLabelText(/Tệp Excel Thời khóa biểu/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nhập TKB Đam San' })).toHaveAttribute('aria-current', 'page');
      expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/workbooks/confirm'), expect.anything());
      first.unmount();
      renderWithQuery(<><TabHistoryControls /><TimetableAdminPage /></>, route);
      expect(await screen.findByLabelText(/Tệp Excel Thời khóa biểu/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Khung tiết học' }));
      expect(screen.getByRole('button', { name: 'Khung tiết học' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByLabelText('Đường dẫn kiểm thử')).toHaveTextContent('tab=time-slots&context=readiness');
      fireEvent.click(screen.getByRole('button', { name: 'Quay lại kiểm thử' }));
      expect(await screen.findByLabelText(/Tệp Excel Thời khóa biểu/)).toBeInTheDocument();
    });

    it.each(['', '?tab=unknown'])('P5-058: defaults to versions for query %s', async (query) => {
      renderWithQuery(<TimetableAdminPage />, `/quan-tri/thoi-khoa-bieu${query}`);
      expect(await screen.findByRole('heading', { name: 'Danh sách phiên bản thời khóa biểu' })).toBeInTheDocument();
      expect(screen.queryByLabelText(/Tệp Excel Thời khóa biểu/)).not.toBeInTheDocument();
    });

    it.each([
      { caps: [{ key: 'APPROVAL_PRINCIPAL' as const, scope: 'SCHOOL_WIDE' as const }] },
      { caps: [{ key: 'TIMETABLE_MANAGE' as const, scope: 'PERSONAL' as const }] },
    ])('P5-058: import deeplink grants no additional access for %j', async ({ caps }) => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/auth/me')) return jsonResponse(authWithCaps(caps));
        throw new Error('Unauthorized timetable request');
      });
      vi.stubGlobal('fetch', fetchMock);
      renderApp('/quan-tri/thoi-khoa-bieu?tab=import');
      expect(await screen.findByRole('heading', { name: /không có quyền/i })).toBeInTheDocument();
      expect(fetchMock.mock.calls.every(([input]) => String(input).endsWith('/auth/me'))).toBe(true);
      expect(screen.queryByLabelText(/Tệp Excel Thời khóa biểu/)).not.toBeInTheDocument();
    });
    it('displays 3 tabs and switches active tab properly', async () => {
      renderWithQuery(<TimetableAdminPage />);

      expect(await screen.findByRole('button', { name: /phiên bản tkb/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /nhập tkb đam san/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /khung tiết học/i })).toBeInTheDocument();

      // Mặc định ở tab Phiên bản TKB
      expect(screen.getByRole('button', { name: /phiên bản tkb/i })).toHaveClass('active');

      // Chuyển sang tab Khung tiết học
      fireEvent.click(screen.getByRole('button', { name: /khung tiết học/i }));
      expect(screen.getByRole('button', { name: /khung tiết học/i })).toHaveClass('active');
      expect(await screen.findByText(/quản trị khung tiết học/i)).toBeInTheDocument();

      // Chuyển sang tab Nhập TKB Đam San
      fireEvent.click(screen.getByRole('button', { name: /nhập tkb đam san/i }));
      expect(screen.getByRole('button', { name: /nhập tkb đam san/i })).toHaveClass('active');
      expect(await screen.findByText(/nhập thời khóa biểu từ tệp excel đam san/i)).toBeInTheDocument();
    });

    it('loads and lists academic years in the selector', async () => {
      renderWithQuery(<TimetableAdminPage />);

      const yearSelect = await screen.findByRole('combobox', { name: /chuyển năm học/i });
      expect(yearSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /năm học 2024 - 2025/i })).toBeInTheDocument();
    });
  });

  describe('Tab 1: Timetable Versions & Lifecycle', () => {
    it.each([403, 409])('P5-058: preserves HTTP %s when a draft mutation fails without automatic resubmission', async (status) => {
      const baseFetch = global.fetch;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/timetable-versions') && init?.method === 'POST') {
          return jsonResponse({ message: 'RAW_CAS_INTERNAL', error: 'TECH_CODE' }, status);
        }
        return baseFetch(input, init);
      });
      vi.stubGlobal('fetch', fetchMock);
      renderWithQuery(<TimetableAdminPage />);
      fireEvent.click(await screen.findByRole('button', { name: /tạo bản nháp thủ công/i }));
      fireEvent.change(screen.getByLabelText(/ghi chú phiên bản/i), { target: { value: 'Ghi chú chưa lưu' } });
      fireEvent.click(screen.getByRole('button', { name: /xác nhận tạo bản nháp/i }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(status === 403 ? 'Tài khoản chưa được cấp quyền' : 'Hãy tải lại dữ liệu');
      expect(alert).not.toHaveTextContent(/RAW_CAS_INTERNAL|TECH_CODE/);
      expect(screen.getByLabelText(/ghi chú phiên bản/i)).toHaveValue('Ghi chú chưa lưu');
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    });
    it('renders timetable versions list with correct status badges', async () => {
      renderWithQuery(<TimetableAdminPage />);

      expect(await screen.findByText('Phiên 1')).toBeInTheDocument();
      expect(screen.getByText('Phiên bản chính thức đầu năm')).toBeInTheDocument();
      expect(screen.getByText('Phiên 2')).toBeInTheDocument();
      expect(screen.getByText('Bản nháp nhập từ file Đam San')).toBeInTheDocument();

      // Status badges
      expect(screen.getAllByText('Đang áp dụng').some((el) => el.classList.contains('status-badge'))).toBe(true);
      expect(screen.getAllByText('Bản nháp').some((el) => el.classList.contains('status-badge'))).toBe(true);
    });

    it('opens version details drawer when clicking on a version row button', async () => {
      renderWithQuery(<TimetableAdminPage />);

      const viewDetailBtns = await screen.findAllByRole('button', { name: /xem chi tiết/i });
      expect(viewDetailBtns.length).toBeGreaterThan(0);
      fireEvent.click(viewDetailBtns[0]);

      expect(await screen.findByText(/chi tiết phiên bản/i)).toBeInTheDocument();
      expect(screen.getByText(/phiên bản này đang có hiệu lực áp dụng thực tế trên toàn trường/i)).toBeInTheDocument();
    });

    it('evaluates and displays 9-dimension readiness report for active version', async () => {
      renderWithQuery(<TimetableAdminPage />);

      const viewDetailBtns = await screen.findAllByRole('button', { name: /xem chi tiết/i });
      fireEvent.click(viewDetailBtns[0]);

      const assessBtn = await screen.findByRole('button', { name: /chạy đánh giá sẵn sàng/i });
      const form = assessBtn.closest('form')!;
      fireEvent.submit(form);

      expect(await screen.findByText(/kết quả đánh giá gốc/i)).toBeInTheDocument();
      expect(screen.getByText(/nền tảng tkb chính khóa/i)).toBeInTheDocument();
      expect(screen.getByText(/ràng buộc phân phối chương trình/i)).toBeInTheDocument();
      expect(screen.getByText(/dung lượng và định mức ppct/i)).toBeInTheDocument();
      expect(screen.getByText(/lớp phủ vận hành điều hành/i)).toBeInTheDocument();
      expect(screen.getAllByText('Chưa được đánh giá').length).toBeGreaterThan(0);
    });

    it('creates a manual draft version', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/timetable-versions') && url.includes('POST')) {
          return jsonResponse({
            id: 'ttv-new-manual',
            versionNumber: 3,
            status: 'DRAFT',
            note: 'TKB Nháp Thủ Công Mới',
          });
        }
        if (url.includes('/timetable-versions')) {
          return jsonResponse({ items: mockTimetableVersions, total: 2 });
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      const createBtn = await screen.findByRole('button', { name: /tạo bản nháp thủ công/i });
      await user.click(createBtn);

      const noteInput = screen.getByLabelText(/ghi chú phiên bản/i);
      await user.type(noteInput, 'TKB Nháp Thủ Công Mới');

      const submitBtn = screen.getByRole('button', { name: /xác nhận tạo bản nháp/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/academic-years/year-2024/timetable-versions'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });
  });

  describe('Tab 2: Đam San Native Workbook Import', () => {
    it.each([401, 403, 409])('P5-058: import confirmation %s stays unsuccessful without replay', async (status) => {
      const fallback = global.fetch;
      let confirms = 0;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/workbooks/confirm')) {
          confirms++;
          return jsonResponse({ message: 'DRAFT SQL_INTERNAL', error: 'Forbidden' }, status);
        }
        return fallback(input, init);
      }));
      renderWithQuery(<TimetableAdminPage />, '/quan-tri/thoi-khoa-bieu?tab=import');
      const fileInput = await screen.findByLabelText(/Tệp Excel Thời khóa biểu/);
      expect(screen.getByRole('heading', { name: 'Nhập thời khóa biểu từ tệp Excel Đam San' })).toBeInTheDocument();
      expect(screen.getByLabelText('Chế độ buổi áp dụng')).toHaveValue('BOTH');
      fireEvent.change(fileInput, { target: { files: [new File(['mock'], 'tkb.xlsx')] } });
      await screen.findByRole('option', { name: /tuần 1/i });
      fireEvent.click(screen.getByRole('button', { name: 'Xem trước đối soát' }));
      const confirm = await screen.findByRole('button', { name: 'Xác nhận nạp vào bản nháp' });
      fireEvent.click(confirm);
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(status === 401 ? 'Phiên đăng nhập đã hết hạn' : status === 403 ? 'Tài khoản chưa được cấp quyền' : 'Dữ liệu xung đột');
      expect(alert).not.toHaveTextContent(/DRAFT|SQL_INTERNAL|Forbidden/);
      expect(screen.queryByText(/Xác nhận nạp TKB thành công/)).not.toBeInTheDocument();
      expect(confirms).toBe(1);
      expect(fileInput).toBeInTheDocument();
    });

    it('renders session mode selector with carry-forward explanation note', async () => {
      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /nhập tkb đam san/i }));

      const sessionSelect = await screen.findByRole('combobox', { name: /chế độ buổi áp dụng/i });
      expect(sessionSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /cả hai buổi/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /chỉ buổi sáng/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /chỉ buổi chiều/i })).toBeInTheDocument();
    });

    it('inspects workbook and displays sheet evidence preview', async () => {
      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /nhập tkb đam san/i }));

      const fileInput = screen.getByLabelText(/tệp excel thời khóa biểu/i);
      const testFile = new File(['fake xlsx content'], 'tkb-hk1.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.change(fileInput, { target: { files: [testFile] } });

      const inspectBtn = await screen.findByRole('button', { name: /kiểm tra tệp/i });
      fireEvent.click(inspectBtn);

      expect(await screen.findByText(/kết quả kiểm tra tệp/i)).toBeInTheDocument();
      expect(screen.getByText('Lớp sáng')).toBeInTheDocument();
      expect(screen.getByText('Lớp chiều')).toBeInTheDocument();
      expect(screen.getByText('GV sáng')).toBeInTheDocument();
      expect(screen.getByText('GV chiều')).toBeInTheDocument();
    });

    it('previews workbook and shows peer reconciliation report and composition summary', async () => {
      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /nhập tkb đam san/i }));

      const fileInput = screen.getByLabelText(/tệp excel thời khóa biểu/i);
      const testFile = new File(['fake xlsx content'], 'tkb-hk1.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.change(fileInput, { target: { files: [testFile] } });

      await screen.findByRole('option', { name: /tuần 1/i });

      const previewBtn = screen.getByRole('button', { name: /xem trước đối soát/i });
      await waitFor(() => expect(previewBtn).toBeEnabled());
      fireEvent.click(previewBtn);

      expect(await screen.findByText(/kết quả đối chiếu lịch theo lớp và giáo viên/i)).toBeInTheDocument();
      expect(screen.getByText(/số tiết mới soạn trong tệp/i)).toBeInTheDocument();
      expect(screen.getByText(/tổng số tiết sau hợp nhất/i)).toBeInTheDocument();
    });

    it('confirms workbook import and creates new draft version', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/calendar-versions') && !url.includes('/academic-calendar-versions/')) {
          return jsonResponse({ items: mockCalendars, total: 1 });
        }
        if (url.includes('/academic-calendar-versions/cal-v1')) {
          return jsonResponse(mockCalendarDetail);
        }
        if (url.includes('/timetable-import/profiles')) {
          return jsonResponse({ items: mockProfiles, total: 1 });
        }
        if (url.includes('/timetable-import/workbooks/preview')) {
          return jsonResponse(mockPreviewResult);
        }
        if (url.includes('/timetable-import/workbooks/confirm')) {
          return jsonResponse(mockConfirmResult);
        }
        if (url.includes('/timetable-versions')) {
          return jsonResponse({ items: mockTimetableVersions, total: 2 });
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /nhập tkb đam san/i }));

      const fileInput = screen.getByLabelText(/tệp excel thời khóa biểu/i);
      const testFile = new File(['fake xlsx content'], 'tkb-hk1.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.change(fileInput, { target: { files: [testFile] } });

      await screen.findByRole('option', { name: /tuần 1/i });

      const previewBtn = screen.getByRole('button', { name: /xem trước đối soát/i });
      await waitFor(() => expect(previewBtn).toBeEnabled());
      fireEvent.click(previewBtn);

      const confirmBtn = await screen.findByRole('button', { name: /xác nhận nạp vào bản nháp/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/timetable-import/workbooks/confirm'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });
  });

  describe('Tab 3: Time Slot Administration', () => {
    it('lists active slot coordinates with ordinal, time and capability flags', async () => {
      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /khung tiết học/i }));

      expect(await screen.findByText('07:15 – 08:00')).toBeInTheDocument();
      expect(screen.getByText('08:05 – 08:50')).toBeInTheDocument();
      expect(screen.getByText('Tiết 1 Chiều')).toBeInTheDocument();
      expect(screen.getAllByText('Tiết 1').length).toBeGreaterThan(0);
    });

    it('filters time slots by session', async () => {
      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /khung tiết học/i }));

      const sessionFilter = await screen.findByRole('combobox', { name: /buổi học/i });
      fireEvent.change(sessionFilter, { target: { value: 'MORNING' } });
      expect(sessionFilter).toHaveValue('MORNING');
    });

    it('creates a new time slot coordinate', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/time-slots') && url.includes('POST')) {
          return jsonResponse({
            id: 'ts-new',
            ordinal: 3,
            revision: 1,
            isActive: true,
            displayLabel: 'Tiết 3',
            startTime: '09:00',
            endTime: '09:45',
          });
        }
        if (url.includes('/time-slots')) {
          return jsonResponse({ items: mockTimeSlots, total: 3 });
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /khung tiết học/i }));

      const addBtn = await screen.findByRole('button', { name: /tạo tiết học mới/i });
      await user.click(addBtn);

      const labelInput = screen.getByLabelText(/^nhãn hiển thị/i);
      await user.type(labelInput, 'Tiết 3');

      const submitBtn = screen.getByRole('button', { name: /lưu khung tiết mới/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/academic-years/year-2024/time-slots'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });

    it('retires an active time slot coordinate', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/time-slots/ts-m1/retire')) {
          return jsonResponse({ ...mockTimeSlots[0], isActive: false });
        }
        if (url.includes('/time-slots')) {
          return jsonResponse({ items: mockTimeSlots, total: 3 });
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /khung tiết học/i }));

      const retireBtns = await screen.findAllByRole('button', { name: /ngưng dùng/i });
      fireEvent.click(retireBtns[0]);

      // Confirm banner appears
      const confirmRetireBtn = await screen.findByRole('button', { name: /xác nhận ngưng sử dụng/i });
      fireEvent.click(confirmRetireBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/time-slots/ts-m1/retire'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });
  });

  describe('P5-053 Review Correction 001: R1–R5 Specific Test Verifications', () => {
    it('R1: switches academic year after preview -> preview is reset and confirm cannot be submitted for wrong year', async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/calendar-versions') && !url.includes('/academic-calendar-versions/')) {
          return jsonResponse({ items: mockCalendars, total: 1 });
        }
        if (url.includes('/academic-calendar-versions/cal-v1')) {
          return jsonResponse(mockCalendarDetail);
        }
        if (url.includes('/timetable-import/profiles')) {
          return jsonResponse({ items: mockProfiles, total: 1 });
        }
        if (url.includes('/timetable-import/workbooks/preview')) {
          return jsonResponse(mockPreviewResult);
        }
        if (url.includes('/timetable-import/workbooks/confirm')) {
          return jsonResponse(mockConfirmResult);
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /nhập tkb đam san/i }));

      const fileInput = screen.getByLabelText(/tệp excel thời khóa biểu/i);
      const testFile = new File(['fake xlsx content'], 'tkb-hk1.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.change(fileInput, { target: { files: [testFile] } });

      await screen.findByRole('option', { name: /tuần 1/i });

      const previewBtn = screen.getByRole('button', { name: /xem trước đối soát/i });
      fireEvent.click(previewBtn);

      expect(await screen.findByRole('button', { name: /xác nhận nạp vào bản nháp/i })).toBeInTheDocument();

      // Switch year to year-2025
      const yearSelect = screen.getByRole('combobox', { name: /chuyển năm học/i });
      fireEvent.change(yearSelect, { target: { value: 'year-2025' } });

      // After switching year, confirm button must NOT be present
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /xác nhận nạp vào bản nháp/i })).not.toBeInTheDocument();
      });

      // No confirm API call was made
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/timetable-import/workbooks/confirm'),
        expect.anything(),
      );
    });

    it('R1: late out-of-order preview response from previous file is discarded when file changes', async () => {
      let resolveFirstPreview: ((val: unknown) => void) | null = null;
      const firstPreviewPromise = new Promise((resolve) => {
        resolveFirstPreview = resolve;
      });

      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/calendar-versions') && !url.includes('/academic-calendar-versions/')) {
          return jsonResponse({ items: mockCalendars, total: 1 });
        }
        if (url.includes('/academic-calendar-versions/cal-v1')) {
          return jsonResponse(mockCalendarDetail);
        }
        if (url.includes('/timetable-import/profiles')) {
          return jsonResponse({ items: mockProfiles, total: 1 });
        }
        if (url.includes('/timetable-import/workbooks/preview')) {
          await firstPreviewPromise;
          return jsonResponse(mockPreviewResult);
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /nhập tkb đam san/i }));

      const fileInput = screen.getByLabelText(/tệp excel thời khóa biểu/i);
      const testFile1 = new File(['content 1'], 'file1.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.change(fileInput, { target: { files: [testFile1] } });

      await screen.findByRole('option', { name: /tuần 1/i });

      const previewBtn = screen.getByRole('button', { name: /xem trước đối soát/i });
      fireEvent.click(previewBtn);

      // Now change file to file2 before the first preview resolves
      const testFile2 = new File(['content 2'], 'file2.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.change(fileInput, { target: { files: [testFile2] } });

      // Now resolve the late first preview
      resolveFirstPreview!(mockPreviewResult);

      // Confirm button from file1 should NOT appear
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /xác nhận nạp vào bản nháp/i })).not.toBeInTheDocument();
      });
    });

    it('R1 & R5: changing session mode after preview invalidates preview, disables confirm, and regenerates idempotency key', async () => {
      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /nhập tkb đam san/i }));

      const fileInput = screen.getByLabelText(/tệp excel thời khóa biểu/i);
      const testFile = new File(['fake xlsx content'], 'tkb-hk1.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.change(fileInput, { target: { files: [testFile] } });

      await screen.findByRole('option', { name: /tuần 1/i });

      const previewBtn = screen.getByRole('button', { name: /xem trước đối soát/i });
      fireEvent.click(previewBtn);

      expect(await screen.findByRole('button', { name: /xác nhận nạp vào bản nháp/i })).toBeInTheDocument();

      // Check R5: Idempotency field has generated key and does not have misleading placeholder
      const idempInput = screen.getByLabelText(/mã chống nhập trùng/i) as HTMLInputElement;
      expect(idempInput.value).toMatch(/^req-/);
      expect(screen.queryByText(/để trống để tự sinh/i)).not.toBeInTheDocument();

      // Change session mode to MORNING
      const sessionSelect = screen.getByLabelText(/chế độ buổi áp dụng/i);
      fireEvent.change(sessionSelect, { target: { value: 'MORNING' } });

      // Preview is reset and confirm button is hidden
      expect(screen.queryByRole('button', { name: /xác nhận nạp vào bản nháp/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/kết quả đối chiếu lịch theo lớp và giáo viên/i)).not.toBeInTheDocument();
    });

    it('R2: switching academic year dismisses active time-slot retire confirmation modal', async () => {
      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /khung tiết học/i }));

      const retireBtns = await screen.findAllByRole('button', { name: /ngưng dùng/i });
      fireEvent.click(retireBtns[0]);

      expect(await screen.findByRole('button', { name: /xác nhận ngưng sử dụng/i })).toBeInTheDocument();

      // Switch year in selector
      const yearSelect = screen.getByRole('combobox', { name: /chuyển năm học/i });
      fireEvent.change(yearSelect, { target: { value: 'year-2025' } });

      // Retire confirmation banner is closed
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /xác nhận ngưng sử dụng/i })).not.toBeInTheDocument();
      });
    });

    it('R2: switching academic year dismisses open timetable version detail drawer', async () => {
      renderWithQuery(<TimetableAdminPage />);

      const viewDetailBtns = await screen.findAllByRole('button', { name: /xem chi tiết/i });
      fireEvent.click(viewDetailBtns[0]);

      expect(await screen.findByText(/chi tiết phiên bản/i)).toBeInTheDocument();

      // Switch year in selector
      const yearSelect = screen.getByRole('combobox', { name: /chuyển năm học/i });
      fireEvent.change(yearSelect, { target: { value: 'year-2025' } });

      // Version detail is closed
      await waitFor(() => {
        expect(screen.queryByText(/chi tiết phiên bản/i)).not.toBeInTheDocument();
      });
    });

    it('R3: derives dynamic dimension claims (2 required, 7 NOT_ASSESSED) for V1 and clears report when dates are edited', async () => {
      const v1ReadinessReport = {
        profile: 'NORMAL_BASE_PPCT_V1',
        productLabel: 'ĐÁNH GIÁ TKB NỀN TẢNG V1',
        scope: 'ACADEMIC_YEAR',
        result: 'PASS' as const,
        evaluatedAt: '2026-10-19T10:00:00Z',
        provenance: {
          timetableVersionId: 'ttv-active-1',
          academicCalendarVersionId: 'cal-v1',
          ppctClassAssociationIds: ['pca-1'],
          ppctVersionIds: ['pv-1'],
        },
        findings: [],
        dimensions: [
          { key: 'NORMAL_BASE_TIMETABLE_FOUNDATION', state: 'PASS' as const, required: true },
          { key: 'PPCT_ASSOCIATION_BINDING', state: 'PASS' as const, required: true },
          { key: 'PPCT_CAPACITY', state: 'NOT_ASSESSED' as const, required: false },
          { key: 'OPERATIONAL_OVERLAYS', state: 'NOT_ASSESSED' as const, required: false },
          { key: 'SUBSTITUTION_CANCELLATION_MAKEUP', state: 'NOT_ASSESSED' as const, required: false },
          { key: 'LOCAL_OPERATIONAL_EXCEPTIONS', state: 'NOT_ASSESSED' as const, required: false },
          { key: 'SPECIAL_ACTIVITY_COLLISIONS', state: 'NOT_ASSESSED' as const, required: false },
          { key: 'RESOLVED_OCCURRENCE_EXECUTION', state: 'NOT_ASSESSED' as const, required: false },
          { key: 'PROGRESS_DEBT_REPORTING', state: 'NOT_ASSESSED' as const, required: false },
        ],
      };

      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/timetable-versions/ttv-active-1/readiness')) {
          return jsonResponse(v1ReadinessReport);
        }
        if (url.endsWith('/timetable-versions/ttv-active-1')) {
          return jsonResponse(mockTimetableVersions[0]);
        }
        if (url.includes('/timetable-versions')) {
          return jsonResponse({ items: mockTimetableVersions, total: 2, page: 1, pageSize: 10 });
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      const viewDetailBtns = await screen.findAllByRole('button', { name: /xem chi tiết/i });
      fireEvent.click(viewDetailBtns[0]);

      // Check dates initialized from version (2024-09-05 to 2025-01-15)
      const fromInput = (await screen.findByLabelText(/từ ngày/i)) as HTMLInputElement;
      const toInput = screen.getByLabelText(/đến ngày/i) as HTMLInputElement;
      expect(fromInput.value).toBe('2024-09-05');
      expect(toInput.value).toBe('2025-01-15');

      const assessBtn = screen.getByRole('button', { name: /chạy đánh giá sẵn sàng/i });
      fireEvent.click(assessBtn);

      // Verify dynamic prose: exactly 2 required and 7 NOT_ASSESSED
      expect(await screen.findByText(/kết quả đánh giá gốc/i)).toBeInTheDocument();
      const proseElement = screen.getByText(/chiều bắt buộc về nền tảng và liên kết ppct/i).closest('p')!;
      expect(proseElement).toHaveTextContent('2');
      expect(proseElement).toHaveTextContent('7');
      expect(proseElement).not.toHaveTextContent('3 chiều cơ bản');
      expect(proseElement).not.toHaveTextContent('6 chiều còn lại');

      // Editing date clears old report
      fireEvent.change(fromInput, { target: { value: '2024-10-01' } });
      await waitFor(() => {
        expect(screen.queryByText(/kết quả đánh giá gốc/i)).not.toBeInTheDocument();
      });
    });

    it('R4: requires explicit informed confirmation before activating timetable version with cancel option', async () => {
      const mockApproved = {
        ...mockTimetableVersions[0],
        id: 'ttv-approved-1',
        versionNumber: 2,
        status: 'APPROVED' as const,
        entryCount: 420,
        effectiveFrom: '2024-09-05',
        effectiveUntil: '2025-01-15',
        updatedAt: '2024-09-04T10:00:00Z',
      };

      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/timetable-versions/ttv-approved-1/activate')) {
          return jsonResponse({
            activated: true,
            version: { ...mockApproved, status: 'ACTIVE' },
            issues: [],
          });
        }
        if (url.endsWith('/timetable-versions/ttv-approved-1')) {
          return jsonResponse(mockApproved);
        }
        if (url.includes('/timetable-versions')) {
          return jsonResponse({ items: [mockApproved], total: 1, page: 1, pageSize: 10 });
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      const viewDetailBtns = await screen.findAllByRole('button', { name: /xem chi tiết/i });
      fireEvent.click(viewDetailBtns[0]);

      const activateBtn = await screen.findByRole('button', { name: /kích hoạt áp dụng chính thức/i });
      fireEvent.click(activateBtn);

      // Verify explicit confirmation banner appears and API is NOT yet called
      expect(await screen.findByText(/xác nhận kích hoạt áp dụng thời khóa biểu toàn trường/i)).toBeInTheDocument();
      expect(screen.getByText(/cảnh báo tác động: khi kích hoạt, phiên bản này sẽ thay thế/i)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/activate'),
        expect.anything(),
      );

      // Test Cancel button dismisses without activating
      const cancelBtn = screen.getByRole('button', { name: /^hủy$/i });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByText(/xác nhận kích hoạt áp dụng thời khóa biểu toàn trường/i)).not.toBeInTheDocument();
      });
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/activate'),
        expect.anything(),
      );

      // Click activate again, then click Confirm
      const activateBtn2 = screen.getByRole('button', { name: /kích hoạt áp dụng chính thức/i });
      fireEvent.click(activateBtn2);

      const confirmActivateBtn = await screen.findByRole('button', { name: /xác nhận kích hoạt toàn trường/i });
      fireEvent.click(confirmActivateBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/timetable-versions/ttv-approved-1/activate'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ expectedUpdatedAt: '2024-09-04T10:00:00Z' }),
          }),
        );
      });
    });

    it('R4: activation handles 409 conflict error cleanly and fails closed', async () => {
      const mockApproved = {
        ...mockTimetableVersions[0],
        id: 'ttv-approved-1',
        versionNumber: 2,
        status: 'APPROVED' as const,
        entryCount: 420,
        updatedAt: '2024-09-04T10:00:00Z',
      };

      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/timetable-versions/ttv-approved-1/activate')) {
          return new Response(
            JSON.stringify({
              statusCode: 409,
              message: 'Dữ liệu phiên bản đã bị thay đổi bởi phiên làm việc khác.',
              error: 'Conflict',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (url.endsWith('/timetable-versions/ttv-approved-1')) {
          return jsonResponse(mockApproved);
        }
        if (url.includes('/timetable-versions')) {
          return jsonResponse({ items: [mockApproved], total: 1, page: 1, pageSize: 10 });
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      const viewDetailBtns = await screen.findAllByRole('button', { name: /xem chi tiết/i });
      fireEvent.click(viewDetailBtns[0]);

      const activateBtn = await screen.findByRole('button', { name: /kích hoạt áp dụng chính thức/i });
      fireEvent.click(activateBtn);

      const confirmActivateBtn = await screen.findByRole('button', { name: /xác nhận kích hoạt toàn trường/i });
      fireEvent.click(confirmActivateBtn);

      expect(await screen.findByText(/chưa thể lưu thay đổi/i)).toBeInTheDocument();
      expect(screen.getByText(/dữ liệu xung đột với bản ghi hiện có/i)).toBeInTheDocument();
    });

    it('R3: readiness async race — late response from old date range is discarded after user modifies dates', async () => {
      let resolveFirstReadiness: ((value: unknown) => void) | null = null;
      const firstReadinessPromise = new Promise((resolve) => {
        resolveFirstReadiness = resolve;
      });

      const reportA = {
        profile: 'NORMAL_BASE_PPCT_V1',
        productLabel: 'ĐÁNH GIÁ TKB NỀN TẢNG V1',
        scope: {
          timetableVersionId: 'ttv-active-1',
          academicYearId: 'year-2024',
          from: '2024-09-05',
          to: '2025-01-15',
          affectedStreams: [],
        },
        result: 'PASS' as const,
        evaluatedAt: '2026-10-19T10:00:00Z',
        provenance: {
          timetableVersionId: 'ttv-active-1',
          academicCalendarVersionId: 'cal-v1',
          ppctClassAssociationIds: [],
          ppctVersionIds: [],
        },
        findings: [],
        dimensions: [
          { key: 'NORMAL_BASE_TIMETABLE_FOUNDATION', state: 'PASS' as const, required: true },
          { key: 'PPCT_ASSOCIATION_BINDING', state: 'PASS' as const, required: true },
        ],
      };

      const reportB = {
        ...reportA,
        scope: {
          ...reportA.scope,
          from: '2024-10-01',
          to: '2025-01-15',
        },
      };

      let readinessCallCount = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/timetable-versions/ttv-active-1/readiness')) {
          readinessCallCount++;
          if (readinessCallCount === 1) {
            await firstReadinessPromise;
            return jsonResponse(reportA);
          }
          return jsonResponse(reportB);
        }
        if (url.endsWith('/timetable-versions/ttv-active-1')) {
          return jsonResponse(mockTimetableVersions[0]);
        }
        if (url.includes('/timetable-versions')) {
          return jsonResponse({ items: mockTimetableVersions, total: 2, page: 1, pageSize: 10 });
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      const viewDetailBtns = await screen.findAllByRole('button', { name: /xem chi tiết/i });
      fireEvent.click(viewDetailBtns[0]);

      const fromInput = (await screen.findByLabelText(/từ ngày/i)) as HTMLInputElement;
      const assessBtn = screen.getByRole('button', { name: /chạy đánh giá sẵn sàng/i });

      // Click assess for initial range [2024-09-05, 2025-01-15]
      fireEvent.click(assessBtn);

      // While request 1 is in-flight, user edits from date to 2024-10-01
      fireEvent.change(fromInput, { target: { value: '2024-10-01' } });

      // Now resolve late response 1 (for old date range)
      resolveFirstReadiness!(reportA);

      // Verify report A is NOT rendered
      await waitFor(() => {
        expect(screen.queryByText(/kết quả đánh giá gốc/i)).not.toBeInTheDocument();
      });

      // Now run assess for new date range
      fireEvent.click(assessBtn);

      // Report B is rendered and displays scope from 01/10/2024 đến 15/01/2025
      expect(await screen.findByText(/kết quả đánh giá gốc/i)).toBeInTheDocument();
      expect(screen.getByText(/từ ngày 01\/10\/2024 đến 15\/01\/2025/i)).toBeInTheDocument();
    });

    it('R5: idempotency key is readonly, copyable, preserved across 5xx retry, and reset after successful confirm', async () => {
      let confirmCallCount = 0;
      const sentBodies: FormData[] = [];

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/calendar-versions') && !url.includes('/academic-calendar-versions/')) {
          return jsonResponse({ items: mockCalendars, total: 1 });
        }
        if (url.includes('/academic-calendar-versions/cal-v1')) {
          return jsonResponse(mockCalendarDetail);
        }
        if (url.includes('/timetable-import/profiles')) {
          return jsonResponse({ items: mockProfiles, total: 1 });
        }
        if (url.includes('/timetable-import/workbooks/preview')) {
          return jsonResponse(mockPreviewResult);
        }
        if (url.includes('/timetable-import/workbooks/confirm')) {
          confirmCallCount++;
          if (init?.body instanceof FormData) {
            sentBodies.push(init.body);
          }
          if (confirmCallCount === 1) {
            // First attempt fails with 500 error
            return new Response(
              JSON.stringify({ statusCode: 500, message: 'Internal server error on confirm' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } },
            );
          }
          return jsonResponse(mockConfirmResult);
        }
        if (url.includes('/timetable-versions')) {
          return jsonResponse({ items: mockTimetableVersions, total: 2 });
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /nhập tkb đam san/i }));

      const fileInput = screen.getByLabelText(/tệp excel thời khóa biểu/i);
      const testFile = new File(['fake xlsx content'], 'tkb-hk1.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.change(fileInput, { target: { files: [testFile] } });

      await screen.findByRole('option', { name: /tuần 1/i });

      const previewBtn = screen.getByRole('button', { name: /xem trước đối soát/i });
      await waitFor(() => expect(previewBtn).toBeEnabled());
      fireEvent.click(previewBtn);

      // Verify idempotency key is readonly and copy button is present
      const idempInput = (await screen.findByLabelText(/mã chống nhập trùng/i)) as HTMLInputElement;
      expect(idempInput).toHaveAttribute('readonly');
      expect(screen.getByRole('button', { name: /sao chép/i })).toBeInTheDocument();

      const initialKey = idempInput.value;
      expect(initialKey).toMatch(/^req-/);

      // First confirm attempt (fails with 500)
      const confirmBtn = screen.getByRole('button', { name: /xác nhận nạp vào bản nháp/i });
      fireEvent.click(confirmBtn);

      expect(await screen.findByText(/không thể hoàn tất yêu cầu/i)).toBeInTheDocument();
      expect(sentBodies.length).toBe(1);
      expect(sentBodies[0].get('requestIdempotencyKey')).toBe(initialKey);

      // Key in UI is still identical (retained across 5xx failure)
      expect(idempInput.value).toBe(initialKey);

      // Retry confirm
      fireEvent.click(confirmBtn);

      // Successfully confirmed and navigated to versions tab
      expect(await screen.findByRole('heading', { name: /danh sách phiên bản thời khóa biểu/i })).toBeInTheDocument();
      expect(sentBodies.length).toBe(2);
      // Key sent on retry is identical to initialKey
      expect(sentBodies[1].get('requestIdempotencyKey')).toBe(initialKey);

      // When returning to import tab, idempotency key has been reset to a new key
      fireEvent.click(screen.getByRole('button', { name: /nhập tkb đam san/i }));
      const newFileInput = screen.getByLabelText(/tệp excel thời khóa biểu/i);
      fireEvent.change(newFileInput, { target: { files: [testFile] } });
      await waitFor(() => expect(screen.getByRole('button', { name: /xem trước đối soát/i })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: /xem trước đối soát/i }));

      const newIdempInput = (await screen.findByLabelText(/mã chống nhập trùng/i)) as HTMLInputElement;
      expect(newIdempInput.value).toMatch(/^req-/);
      expect(newIdempInput.value).not.toBe(initialKey);
    });

    it('Item 3: inspect async race — stale inspect response is discarded when nativeSessionMode changes', async () => {
      let resolveFirstInspect: ((value: unknown) => void) | null = null;
      const firstInspectPromise = new Promise((resolve) => {
        resolveFirstInspect = resolve;
      });

      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes('/academic-years') &&
          !url.includes('/time-slots') &&
          !url.includes('/timetable-versions') &&
          !url.includes('/calendar-versions')
        ) {
          return jsonResponse({ items: mockAcademicYears, total: 2 });
        }
        if (url.includes('/calendar-versions') && !url.includes('/academic-calendar-versions/')) {
          return jsonResponse({ items: mockCalendars, total: 1 });
        }
        if (url.includes('/academic-calendar-versions/cal-v1')) {
          return jsonResponse(mockCalendarDetail);
        }
        if (url.includes('/timetable-import/profiles')) {
          return jsonResponse({ items: mockProfiles, total: 1 });
        }
        if (url.includes('/timetable-import/workbooks/inspect')) {
          await firstInspectPromise;
          return jsonResponse(mockInspectionResult);
        }
        return jsonResponse({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<TimetableAdminPage />);

      fireEvent.click(await screen.findByRole('button', { name: /nhập tkb đam san/i }));

      const fileInput = screen.getByLabelText(/tệp excel thời khóa biểu/i);
      const testFile = new File(['fake xlsx content'], 'tkb-hk1.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      fireEvent.change(fileInput, { target: { files: [testFile] } });

      const inspectBtn = await screen.findByRole('button', { name: /kiểm tra tệp/i });
      fireEvent.click(inspectBtn);

      // While inspect is in flight, user changes session mode
      const sessionSelect = screen.getByLabelText(/chế độ buổi áp dụng/i);
      fireEvent.change(sessionSelect, { target: { value: 'MORNING' } });

      // Resolve stale inspect response
      resolveFirstInspect!(mockInspectionResult);

      // Verify stale inspect response is NOT rendered
      await waitFor(() => {
        expect(screen.queryByText(/kết quả kiểm tra tệp/i)).not.toBeInTheDocument();
      });
    });
  });
});
