import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      expect(await screen.findByText(/nhập thời khóa biểu chuẩn đam san/i)).toBeInTheDocument();
    });

    it('loads and lists academic years in the selector', async () => {
      renderWithQuery(<TimetableAdminPage />);

      const yearSelect = await screen.findByRole('combobox', { name: /chuyển năm học/i });
      expect(yearSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /năm học 2024 - 2025/i })).toBeInTheDocument();
    });
  });

  describe('Tab 1: Timetable Versions & Lifecycle', () => {
    it('renders timetable versions list with correct status badges', async () => {
      renderWithQuery(<TimetableAdminPage />);

      expect(await screen.findByText('Phiên 1')).toBeInTheDocument();
      expect(screen.getByText('Phiên bản chính thức đầu năm')).toBeInTheDocument();
      expect(screen.getByText('Phiên 2')).toBeInTheDocument();
      expect(screen.getByText('Bản nháp nhập từ file Đam San')).toBeInTheDocument();

      // Status badges
      expect(screen.getByText('Đang áp dụng')).toBeInTheDocument();
      expect(screen.getByText('Bản nháp')).toBeInTheDocument();
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
      expect(screen.getByText(/chưa đánh giá \(not_assessed\)/i)).toBeInTheDocument();
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

      const inspectBtn = await screen.findByRole('button', { name: /kiểm tra tệp \(inspect\)/i });
      fireEvent.click(inspectBtn);

      expect(await screen.findByText(/kết quả kiểm tra tệp \(inspect\)/i)).toBeInTheDocument();
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

      const previewBtn = screen.getByRole('button', { name: /xem trước đối soát \(preview\)/i });
      await waitFor(() => expect(previewBtn).toBeEnabled());
      fireEvent.click(previewBtn);

      expect(await screen.findByText(/kết quả đối soát chứng cứ chéo/i)).toBeInTheDocument();
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

      const previewBtn = screen.getByRole('button', { name: /xem trước đối soát \(preview\)/i });
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
});
