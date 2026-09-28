import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GddpWorkbookConfirmResponse,
  GddpWorkbookInspectionResponse,
  GddpWorkbookPreviewResponse,
  HdtnWorkbookConfirmResponse,
  HdtnWorkbookInspectionResponse,
  HdtnWorkbookPreviewResponse,
  ProgrammeWorkspaceDetailResponse,
  ProgrammeWorkspaceOptionsResponse,
} from '@baogiang/contracts';
import { SpecialProgrammeWorkspacePage } from '../pages/SpecialProgrammeWorkspacePage';
import { jsonResponse, renderWithQuery } from './test-utils';

const mockOptions: ProgrammeWorkspaceOptionsResponse = {
  academicYears: [
    { id: 'year-2024', code: '2024-2025', name: 'Năm học 2024 - 2025' },
    { id: 'year-2025', code: '2025-2026', name: 'Năm học 2025 - 2026' },
  ],
  masters: [
    {
      id: 'master-hdtn-1',
      academicYearId: 'year-2024',
      academicYearCode: '2024-2025',
      academicYearName: 'Năm học 2024 - 2025',
      kind: 'HDTN_HN',
      kindLabel: 'Hoạt động trải nghiệm, hướng nghiệp',
      gradeLevel: 10,
      label: 'HĐTN-HN Khối 10',
      latestVersionNumber: 1,
      latestVersionStatus: 'DRAFT',
    },
  ],
};

const mockHdtnInspect: HdtnWorkbookInspectionResponse = {
  sourceFileName: 'hdtn_sample.xlsx',
  sheets: [
    {
      name: 'PhanCongHDTN',
      rowCount: 35,
      columnCount: 10,
      headers: ['Tuan', 'ChuDe', 'Tiet', 'Lop', 'GiaoVien'],
      isDataSheet: true,
    },
  ],
  dataSheetFound: true,
  issues: [],
};

const mockHdtnPreview: HdtnWorkbookPreviewResponse = {
  sourceFileName: 'hdtn_sample.xlsx',
  sheetName: 'PhanCongHDTN',
  academicYearId: 'year-2024',
  calendarVersionId: 'cal-v1',
  previewFingerprint: 'fp-hdtn-unique-123',
  canConfirm: true,
  blockingIssueCount: 0,
  warningCount: 0,
  totalRows: 1,
  rows: [
    {
      sourceRowNumber: 2,
      weekFrom: 1,
      weekTo: 2,
      requiredPeriods: 2,
      organizingScope: 'CLASS',
      organizingScopeLabel: 'Theo lớp',
      gradeLevel: 10,
      topicTitle: 'Xây dựng truyền thống nhà trường',
      enteredTeacherText: 'Nguyễn Văn A',
      resolvedTeachers: [
        {
          enteredName: 'Nguyễn Văn A',
          staffCode: 'GV001',
          matchedUserId: 'teacher-uuid-1',
          displayName: 'Nguyễn Văn A',
        },
      ],
      targetClassCodes: ['10A1'],
      resolvedCandidateCount: 1,
      slots: [
        {
          civilDate: '2024-09-09',
          weekday: 'MONDAY',
          timeSlotDefinitionId: 'slot-def-1',
          periodNumber: 1,
          startTime: '07:00',
          endTime: '07:45',
        },
      ],
      issues: [],
    },
  ],
  issues: [],
};

const mockHdtnConfirm: HdtnWorkbookConfirmResponse = {
  outcome: 'CREATED',
  commandId: 'cmd-confirm-1',
  programmeMasterId: 'master-hdtn-1',
  programmePlanVersionId: 'plan-hdtn-1',
  versionNumber: 1,
  status: 'DRAFT',
  topicItemCount: 1,
  occurrenceCount: 1,
  slotCount: 1,
  staffingCount: 1,
};

const mockMasterDetailDraft: ProgrammeWorkspaceDetailResponse = {
  master: {
    id: 'master-hdtn-1',
    kind: 'HDTN_HN',
    kindLabel: 'Hoạt động trải nghiệm, hướng nghiệp',
    academicYearId: 'year-2024',
    academicYearCode: '2024-2025',
    academicYearName: 'Năm học 2024 - 2025',
    gradeLevel: 10,
    label: 'HĐTN-HN Khối 10',
  },
  plan: {
    id: 'plan-hdtn-1',
    versionNumber: 1,
    status: 'DRAFT',
    draftRevision: 1,
    changeReason: 'Kế hoạch khởi tạo ban đầu',
    publishedAt: null,
    topics: [
      {
        id: 'topic-uuid-1',
        sequence: 1,
        title: 'Xây dựng truyền thống nhà trường',
        requiredPeriods: 2,
        guidelineWeekFrom: 1,
        guidelineWeekTo: 2,
        guidelineSegmentLabel: null,
      },
    ],
  },
  occurrences: [
    {
      id: 'occ-uuid-1',
      status: 'DRAFT',
      draftRevision: 1,
      topicItemId: 'topic-uuid-1',
      topicSequence: 1,
      topicTitle: 'Xây dựng truyền thống nhà trường',
      civilDate: '2024-09-09',
      mode: 'CLASS',
      modeLabel: 'Theo lớp',
      gradeLevel: 10,
      schoolClassId: 'class-uuid-1',
      schoolClassCode: '10A1',
      schoolClassName: 'Lớp 10A1',
      note: 'Tiết sinh hoạt đầu tuần',
      replacesOccurrenceId: null,
      slots: [
        {
          id: 'slot-uuid-1',
          timeSlotDefinitionId: 'slot-def-uuid-1',
          periodNumber: 1,
          startTime: '07:00',
          endTime: '07:45',
          staffing: [
            {
              userId: 'teacher-uuid-1',
              displayName: 'Nguyễn Văn A',
              staffCode: 'GV001',
            },
          ],
        },
      ],
      lifecycleSummary: {
        materialized: false,
        materializedActivityCount: 0,
        hasActiveAttestation: false,
        activeAttestationCount: 0,
      },
    },
  ],
  lifecycleSummary: {
    totalOccurrences: 1,
    materializedOccurrences: 0,
    attestedOccurrences: 0,
    isFullyMaterialized: false,
  },
};

const mockGddpInspect: GddpWorkbookInspectionResponse = {
  sourceFileName: 'gddp_k10.xlsx',
  sheets: [
    {
      name: 'GDDP_10',
      rowCount: 18,
      columnCount: 8,
      headers: ['Khoi', 'Tuan', 'TietPPCT', 'ChuDe', 'GiaoVien'],
      isDataSheet: true,
    },
  ],
  dataSheetFound: true,
  issues: [],
};

const mockGddpPreview: GddpWorkbookPreviewResponse = {
  sourceFileName: 'gddp_k10.xlsx',
  sheetName: 'GDDP_10',
  academicYearId: 'year-2024',
  gradeLevel: 10,
  calendarVersionId: 'cal-v1',
  previewFingerprint: 'fp-gddp-k10-fingerprint',
  canConfirm: true,
  blockingIssueCount: 0,
  warningCount: 0,
  totalRows: 1,
  rows: [
    {
      sourceRowNumber: 2,
      gradeLevel: 10,
      ppctCoordinates: [1],
      ppctText: '1',
      officialWeeks: [1],
      weeksText: '1',
      requiredPeriods: 1,
      topicTitle: 'Địa lý địa phương tỉnh Đắk Lắk',
      enteredTeacherText: 'Trần Thị B',
      resolvedTeachers: [
        {
          staffCode: 'GV002',
          matchedUserId: 'teacher-uuid-2',
          displayName: 'Trần Thị B',
        },
      ],
      targetClassCodes: ['10A1', '10A2'],
      resolvedCandidateCount: 1,
      slots: [
        {
          civilDate: '2024-09-10',
          weekday: 'TUESDAY',
          timeSlotDefinitionId: 'slot-def-2',
          periodNumber: 2,
          startTime: '07:50',
          endTime: '08:35',
        },
      ],
      issues: [],
    },
  ],
  issues: [],
};

const mockGddpConfirm: GddpWorkbookConfirmResponse = {
  outcome: 'CREATED',
  commandId: 'cmd-gddp-confirm-1',
  programmeMasterId: 'master-gddp-10',
  programmePlanVersionId: 'plan-gddp-10',
  versionNumber: 1,
  status: 'DRAFT',
  topicItemCount: 1,
  occurrenceCount: 1,
  slotCount: 1,
  staffingCount: 1,
};

describe('SpecialProgrammeWorkspacePage (P4-074B Section 21 & 22)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('HĐTN Import Flow (Section 21)', () => {
    it('executes full HĐTN import flow: select file, inspect, preview, confirm draft, loads durable review', async () => {
      const user = userEvent.setup();

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/programme-planning/workspace/options')) {
          return jsonResponse(mockOptions);
        }
        if (url.includes('/programme-planning/hdtn-import/inspect')) {
          return jsonResponse(mockHdtnInspect);
        }
        if (url.includes('/programme-planning/hdtn-import/preview')) {
          return jsonResponse(mockHdtnPreview);
        }
        if (url.includes('/programme-planning/hdtn-import/confirm')) {
          return jsonResponse(mockHdtnConfirm);
        }
        if (url.includes('/programme-planning/workspace/masters/master-hdtn-1')) {
          return jsonResponse(mockMasterDetailDraft);
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      // Verify Page Header
      expect(await screen.findByRole('heading', { name: 'Kế hoạch HĐTN-HN & GDĐP' })).toBeInTheDocument();
      expect(screen.getByLabelText('Năm học')).toHaveValue('year-2024');

      // Select file
      const file = new File(['mock content'], 'hdtn_sample.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const fileInput = screen.getByLabelText('Chọn tệp Excel (.xlsx)');
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText(/Đã chọn tệp: hdtn_sample.xlsx/)).toBeInTheDocument();

      // Inspect
      const inspectBtn = screen.getByRole('button', { name: 'Kiểm tra tệp' });
      await user.click(inspectBtn);

      expect(await screen.findByRole('heading', { name: 'Kết quả kiểm tra tệp' })).toBeInTheDocument();
      expect(screen.getByText(/Đã tìm thấy trang dữ liệu/)).toBeInTheDocument();

      // Preview
      const previewBtn = screen.getByRole('button', { name: 'Xem trước kế hoạch' });
      await user.click(previewBtn);

      expect(await screen.findByRole('heading', { name: 'Xem trước kế hoạch HĐTN-HN' })).toBeInTheDocument();
      expect(screen.getByText('Xây dựng truyền thống nhà trường')).toBeInTheDocument();
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
      expect(screen.getByText(/GV001/)).toBeInTheDocument();

      // Ensure NO raw UUID or technical IDs leaked in preview visible text
      expect(screen.queryByText('teacher-uuid-1')).not.toBeInTheDocument();
      expect(screen.queryByText('slot-def-1')).not.toBeInTheDocument();
      expect(screen.queryByText('fp-hdtn-unique-123')).not.toBeInTheDocument();

      // Confirm button is shown because canConfirm=true
      const confirmDraftBtn = screen.getByRole('button', { name: 'Xác nhận tạo bản nháp' });
      await user.click(confirmDraftBtn);

      // Warning text in confirm dialog
      expect(screen.getByRole('region', { name: 'Xác nhận tạo bản nháp kế hoạch HĐTN-HN' })).toBeInTheDocument();
      expect(screen.getByText(/Thao tác này chỉ tạo/)).toBeInTheDocument();
      expect(screen.getByText(/Chưa ban hành kế hoạch chính thức/)).toBeInTheDocument();
      expect(screen.getByText(/Chưa đưa vào lịch hoạt động/)).toBeInTheDocument();

      // Confirm submission
      const proceedConfirmBtn = screen.getByRole('button', { name: 'Xác nhận lưu bản nháp' });
      await user.click(proceedConfirmBtn);

      // Confirm API call check
      const confirmCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/hdtn-import/confirm'));
      expect(confirmCall).toBeDefined();
      const body = confirmCall![1].body as FormData;
      expect(body.get('academicYearId')).toBe('year-2024');
      expect(body.get('expectedPreviewFingerprint')).toBe('fp-hdtn-unique-123');
      expect(body.get('commandId')).toBeTruthy();

      // After confirm success, loads durable review
      expect(await screen.findByRole('heading', { name: 'HĐTN-HN Khối 10', level: 3 })).toBeInTheDocument();
      expect(screen.getByText(/Đã tạo thành công bản nháp kế hoạch/)).toBeInTheDocument();
    });

    it('renders blockers and disables confirm if canConfirm is false', async () => {
      const user = userEvent.setup();

      const blockerPreview: HdtnWorkbookPreviewResponse = {
        ...mockHdtnPreview,
        canConfirm: false,
        blockingIssueCount: 1,
        issues: [
          {
            severity: 'BLOCKER',
            code: 'MISSING_TEACHER',
            message: 'Không tìm thấy giáo viên phân công trong hệ thống nhân sự.',
            sourceRowNumber: 5,
          },
        ],
      };

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) return jsonResponse(mockOptions);
        if (url.includes('/hdtn-import/preview')) return jsonResponse(blockerPreview);
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);
      const file = new File(['dummy'], 'test.xlsx');
      fireEvent.change(await screen.findByLabelText('Chọn tệp Excel (.xlsx)'), { target: { files: [file] } });

      await user.click(screen.getByRole('button', { name: 'Xem trước kế hoạch' }));

      expect(await screen.findByText(/Lỗi cần xử lý \(Dòng 5\):/)).toBeInTheDocument();
      expect(screen.getByText('Không tìm thấy giáo viên phân công trong hệ thống nhân sự.')).toBeInTheDocument();

      // Confirm button is disabled
      const confirmBtn = screen.getByRole('button', { name: 'Xác nhận tạo bản nháp' });
      expect(confirmBtn).toBeDisabled();
    });
  });

  describe('GDĐP Import Flow (Section 21)', () => {
    it('executes GDĐP import with preview gradeLevel and confirms with exact canonical grade', async () => {
      const user = userEvent.setup();

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) return jsonResponse(mockOptions);
        if (url.includes('/gddp-import/inspect')) return jsonResponse(mockGddpInspect);
        if (url.includes('/gddp-import/preview')) return jsonResponse(mockGddpPreview);
        if (url.includes('/gddp-import/confirm')) return jsonResponse(mockGddpConfirm);
        if (url.includes('/workspace/masters/master-gddp-10')) {
          return jsonResponse({
            ...mockMasterDetailDraft,
            master: { ...mockMasterDetailDraft.master, id: 'master-gddp-10', label: 'GDĐP Khối 10', kind: 'GDDP' },
          });
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      // Switch to GDĐP tab
      await user.click(await screen.findByRole('button', { name: 'Giáo dục địa phương (GDĐP)' }));
      expect(screen.getByRole('heading', { name: 'Nhập kế hoạch Giáo dục địa phương' })).toBeInTheDocument();

      // Select file
      const file = new File(['gddp-data'], 'gddp_k10.xlsx');
      fireEvent.change(screen.getByLabelText('Chọn tệp Excel (.xlsx)'), { target: { files: [file] } });

      // Preview
      await user.click(screen.getByRole('button', { name: 'Xem trước kế hoạch' }));

      // Preview displays canonical grade
      expect(await screen.findByRole('heading', { name: 'Xem trước kế hoạch Giáo dục địa phương' })).toBeInTheDocument();
      expect(screen.getAllByText('Khối 10').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Địa lý địa phương tỉnh Đắk Lắk')).toBeInTheDocument();
      expect(screen.getByText('Trần Thị B')).toBeInTheDocument();
      expect(screen.getByText(/GV002/)).toBeInTheDocument();

      // Confirm
      await user.click(screen.getByRole('button', { name: 'Xác nhận tạo bản nháp' }));
      await user.click(screen.getByRole('button', { name: 'Xác nhận lưu bản nháp' }));

      // Verify GDĐP confirm payload sent exact gradeLevel 10 and fingerprint
      const confirmCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/gddp-import/confirm'));
      expect(confirmCall).toBeDefined();
      const body = confirmCall![1].body as FormData;
      expect(body.get('gradeLevel')).toBe('10');
      expect(body.get('expectedPreviewFingerprint')).toBe('fp-gddp-k10-fingerprint');

      // Verify switch to durable review
      expect(await screen.findByRole('heading', { name: 'GDĐP Khối 10', level: 3 })).toBeInTheDocument();
    });
  });

  describe('Lifecycle UI (Section 22)', () => {
    it('supports DRAFT plan publish, occurrence publish, and occurrence materialize lifecycle flow', async () => {
      const user = userEvent.setup();

      const currentDetail = JSON.parse(JSON.stringify(mockMasterDetailDraft)) as ProgrammeWorkspaceDetailResponse;

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) {
          return jsonResponse({
            academicYears: [{ id: 'year-2024', code: '2024-2025', name: 'Năm học 2024 - 2025' }],
            masters: [mockOptions.masters[0]],
          });
        }
        if (url.includes('/workspace/masters/master-hdtn-1')) {
          return jsonResponse(currentDetail);
        }
        if (url.includes('/plan-versions/plan-hdtn-1/publish')) {
          currentDetail.plan!.status = 'PUBLISHED';
          return jsonResponse({ id: 'plan-hdtn-1', status: 'PUBLISHED' });
        }
        if (url.includes('/occurrences/occ-uuid-1/publish')) {
          currentDetail.occurrences[0].status = 'PUBLISHED';
          return jsonResponse({ id: 'occ-uuid-1', status: 'PUBLISHED' });
        }
        if (url.includes('/occurrences/occ-uuid-1/materialize')) {
          currentDetail.occurrences[0].lifecycleSummary.materialized = true;
          currentDetail.lifecycleSummary.materializedOccurrences = 1;
          currentDetail.lifecycleSummary.isFullyMaterialized = true;
          return jsonResponse([{ id: 'mat-1' }]);
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      // Switch to Review tab
      await user.click(await screen.findByRole('button', { name: /Rà soát & Vận hành/ }));

      // Select existing master
      await user.click(await screen.findByRole('button', { name: 'Chọn xem chi tiết' }));

      // 1. DRAFT plan has "Ban hành kế hoạch" button
      const publishPlanBtn = await screen.findByRole('button', { name: 'Ban hành kế hoạch' });
      expect(publishPlanBtn).toBeInTheDocument();

      // Plan is DRAFT -> occurrence publish is NOT allowed yet
      expect(screen.queryByRole('button', { name: 'Ban hành hoạt động' })).not.toBeInTheDocument();

      // Click "Ban hành kế hoạch"
      await user.click(publishPlanBtn);
      expect(screen.getByRole('region', { name: 'Xác nhận ban hành kế hoạch' })).toBeInTheDocument();
      expect(screen.getByText(/kế hoạch này không thể chỉnh sửa trực tiếp/)).toBeInTheDocument();

      // Confirm publish plan
      await user.click(screen.getByRole('button', { name: 'Xác nhận ban hành' }));

      // Verify publish call was made with exact draftRevision 1
      const planPublishCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/plan-versions/plan-hdtn-1/publish'));
      expect(planPublishCall).toBeDefined();
      expect(JSON.parse(String(planPublishCall![1].body))).toEqual({
        expectedRevision: 1,
        commandId: expect.any(String),
      });

      // 2. Now plan is PUBLISHED:
      // "Ban hành kế hoạch" button is gone
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Ban hành kế hoạch' })).not.toBeInTheDocument();
      });
      expect(screen.getByText(/Kế hoạch đã ban hành không được sửa trực tiếp/)).toBeInTheDocument();

      // And occurrence is DRAFT -> "Ban hành hoạt động" is now available!
      const publishOccBtn = await screen.findByRole('button', { name: 'Ban hành hoạt động' });
      expect(publishOccBtn).toBeInTheDocument();

      // Publish occurrence
      await user.click(publishOccBtn);
      const occPublishCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/occurrences/occ-uuid-1/publish'));
      expect(occPublishCall).toBeDefined();
      expect(JSON.parse(String(occPublishCall![1].body))).toEqual({
        expectedRevision: 1,
        commandId: expect.any(String),
      });

      // 3. Now occurrence is PUBLISHED and not materialized:
      // "Đưa vào lịch hoạt động" is now available!
      const matBtn = await screen.findByRole('button', { name: 'Đưa vào lịch hoạt động' });
      expect(matBtn).toBeInTheDocument();

      await user.click(matBtn);

      // Warning text in materialize dialog
      expect(screen.getByRole('region', { name: 'Xác nhận đưa hoạt động vào lịch vận hành' })).toBeInTheDocument();
      expect(screen.getByText(/tự tạo biên bản thực hiện giảng dạy/)).toBeInTheDocument();
      expect(screen.getByText(/tự tạo chứng thực \/ xác nhận nghiệp vụ/)).toBeInTheDocument();

      // Confirm materialize
      await user.click(screen.getByRole('button', { name: 'Xác nhận đưa vào lịch' }));

      // Verify materialize call
      const matCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/occurrences/occ-uuid-1/materialize'));
      expect(matCall).toBeDefined();

      // Once materialized: "Đưa vào lịch hoạt động" button is NO longer shown
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Đưa vào lịch hoạt động' })).not.toBeInTheDocument();
      });
      expect(screen.getAllByText('Đã đưa vào lịch').length).toBeGreaterThanOrEqual(1);

      // Ensure NO internal UUIDs leaked in visible text
      expect(screen.queryByText('occ-uuid-1')).not.toBeInTheDocument();
      expect(screen.queryByText('slot-uuid-1')).not.toBeInTheDocument();
      expect(screen.queryByText('class-uuid-1')).not.toBeInTheDocument();
    });
  });

  describe('Year Filter Consistency (Correction B & Regression)', () => {
    it('only renders masters matching the selected academic year, even if options contains multiple years', async () => {
      const user = userEvent.setup();
      const multiYearOptions: ProgrammeWorkspaceOptionsResponse = {
        academicYears: [
          { id: 'year-A', code: '2024-2025', name: 'Năm học 2024 - 2025' },
          { id: 'year-B', code: '2025-2026', name: 'Năm học 2025 - 2026' },
        ],
        masters: [
          {
            id: 'master-A',
            academicYearId: 'year-A',
            academicYearCode: '2024-2025',
            academicYearName: 'Năm học 2024 - 2025',
            kind: 'HDTN_HN',
            kindLabel: 'HĐTN-HN',
            gradeLevel: 10,
            label: 'Chương trình Năm A',
            latestVersionNumber: 1,
            latestVersionStatus: 'DRAFT',
          },
          {
            id: 'master-B',
            academicYearId: 'year-B',
            academicYearCode: '2025-2026',
            academicYearName: 'Năm học 2025 - 2026',
            kind: 'GDDP',
            kindLabel: 'GDĐP',
            gradeLevel: 11,
            label: 'Chương trình Năm B',
            latestVersionNumber: 1,
            latestVersionStatus: 'DRAFT',
          },
        ],
      };

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) {
          return jsonResponse(multiYearOptions);
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      // Switch to Review tab
      await user.click(await screen.findByRole('button', { name: /Rà soát & Vận hành/ }));

      // Dropdown initially defaults to year-A
      expect(screen.getByLabelText('Năm học')).toHaveValue('year-A');

      // Only master-A is visible, master-B is NOT visible
      expect(screen.getByText('Chương trình Năm A')).toBeInTheDocument();
      expect(screen.queryByText('Chương trình Năm B')).not.toBeInTheDocument();

      // Switch dropdown to year-B
      await user.selectOptions(screen.getByLabelText('Năm học'), 'year-B');
      expect(screen.getByLabelText('Năm học')).toHaveValue('year-B');

      // Now only master-B is visible, master-A is NOT visible
      expect(screen.getByText('Chương trình Năm B')).toBeInTheDocument();
      expect(screen.queryByText('Chương trình Năm A')).not.toBeInTheDocument();
    });
  });

  describe('GDĐP Grade Change Invalidates Preview (Correction C & Regression)', () => {
    it('invalidates preview and disables confirm when grade selection changes, requiring re-preview', async () => {
      const user = userEvent.setup();
      let previewCallCount = 0;

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) return jsonResponse(mockOptions);
        if (url.includes('/gddp-import/preview')) {
          previewCallCount++;
          const grade = previewCallCount === 1 ? 10 : 11;
          return jsonResponse({
            ...mockGddpPreview,
            gradeLevel: grade,
            previewFingerprint: `fp-gddp-grade-${grade}`,
            rows: [{ ...mockGddpPreview.rows[0], gradeLevel: grade }],
          });
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      // Switch to GDĐP tab
      await user.click(await screen.findByRole('button', { name: 'Giáo dục địa phương (GDĐP)' }));

      // Select file
      const file = new File(['mock content'], 'gddp_test.xlsx');
      fireEvent.change(screen.getByLabelText('Chọn tệp Excel (.xlsx)'), { target: { files: [file] } });

      // Select grade 10
      const gradeSelect = screen.getByLabelText(/Khối lớp/);
      await user.selectOptions(gradeSelect, '10');

      // Preview grade 10
      await user.click(screen.getByRole('button', { name: 'Xem trước kế hoạch' }));
      expect(await screen.findByRole('heading', { name: 'Xem trước kế hoạch Giáo dục địa phương' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Xác nhận tạo bản nháp' })).toBeInTheDocument();

      // Change grade dropdown to 11
      await user.selectOptions(gradeSelect, '11');

      // Preview must disappear and confirm must NOT be present
      expect(screen.queryByRole('heading', { name: 'Xem trước kế hoạch Giáo dục địa phương' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Xác nhận tạo bản nháp' })).not.toBeInTheDocument();

      // Re-preview for grade 11
      await user.click(screen.getByRole('button', { name: 'Xem trước kế hoạch' }));
      expect(await screen.findByRole('heading', { name: 'Xem trước kế hoạch Giáo dục địa phương' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Xác nhận tạo bản nháp' })).toBeInTheDocument();
      expect(previewCallCount).toBe(2);
    });
  });

  describe('Safe Vietnamese Enum Fallback (Correction D & Regression)', () => {
    it('does not leak raw unmapped enums for unknown mode or status, rendering safe Vietnamese copy', async () => {
      const user = userEvent.setup();

      const unknownEnumsDetail: ProgrammeWorkspaceDetailResponse = {
        ...mockMasterDetailDraft,
        plan: {
          ...mockMasterDetailDraft.plan!,
          status: 'UNRECOGNIZED_PLAN_STATUS' as unknown as 'DRAFT',
        },
        occurrences: [
          {
            ...mockMasterDetailDraft.occurrences[0],
            mode: 'UNRECOGNIZED_MODE' as unknown as 'CLASS',
            status: 'UNRECOGNIZED_OCC_STATUS' as unknown as 'DRAFT',
          },
        ],
      };

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) {
          return jsonResponse({
            academicYears: [{ id: 'year-2024', code: '2024-2025', name: 'Năm học 2024 - 2025' }],
            masters: [mockOptions.masters[0]],
          });
        }
        if (url.includes('/workspace/masters/master-hdtn-1')) {
          return jsonResponse(unknownEnumsDetail);
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      // Switch to Review tab and open master
      await user.click(await screen.findByRole('button', { name: /Rà soát & Vận hành/ }));
      await user.click(await screen.findByRole('button', { name: 'Chọn xem chi tiết' }));

      // Wait for master detail to render
      expect(await screen.findByText(/Phiên bản kế hoạch/)).toBeInTheDocument();

      // Ensure raw enum strings are NOT present
      expect(screen.queryByText('UNRECOGNIZED_PLAN_STATUS')).not.toBeInTheDocument();
      expect(screen.queryByText('UNRECOGNIZED_MODE')).not.toBeInTheDocument();
      expect(screen.queryByText('UNRECOGNIZED_OCC_STATUS')).not.toBeInTheDocument();

      // Ensure fallback Vietnamese labels are rendered
      expect(screen.getAllByText('Trạng thái không xác định').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Không xác định/).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Frontend Idempotency & Command Isolation (Correction A & Section 7 Regression)', () => {
    it('A. Publish plan: keeps same commandId across network error retry (ApiError status 0)', async () => {
      const user = userEvent.setup();
      let publishCallCount = 0;

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) return jsonResponse(mockOptions);
        if (url.includes('/workspace/masters/master-hdtn-1')) return jsonResponse(mockMasterDetailDraft);
        if (url.includes('/plan-versions/plan-hdtn-1/publish')) {
          publishCallCount++;
          if (publishCallCount === 1) {
            return Promise.reject(new TypeError('Failed to fetch'));
          }
          return jsonResponse({ id: 'plan-hdtn-1', status: 'PUBLISHED' });
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      // Open review tab and select master
      await user.click(await screen.findByRole('button', { name: /Rà soát & Vận hành/ }));
      await user.click(await screen.findByRole('button', { name: 'Chọn xem chi tiết' }));

      // Click "Ban hành kế hoạch" to open confirm dialog
      await user.click(await screen.findByRole('button', { name: 'Ban hành kế hoạch' }));
      const confirmPublishBtn = screen.getByRole('button', { name: 'Xác nhận ban hành' });

      // 1st click: network failure
      await user.click(confirmPublishBtn);
      expect(await screen.findByText(/Không thể kết nối đến máy chủ/)).toBeInTheDocument();

      // 2nd click: retry exact action
      await user.click(confirmPublishBtn);
      await waitFor(() => {
        expect(publishCallCount).toBe(2);
      });

      // Verify commandId of call 2 is EXACTLY equal to call 1
      const publishCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/plan-versions/plan-hdtn-1/publish'));
      expect(publishCalls).toHaveLength(2);
      const body1 = JSON.parse(String(publishCalls[0][1].body));
      const body2 = JSON.parse(String(publishCalls[1][1].body));
      expect(body1.commandId).toBeTruthy();
      expect(body2.commandId).toBe(body1.commandId);
    });

    it('B. Publish occurrence: keeps same commandId across network error retry (ApiError status 0)', async () => {
      const user = userEvent.setup();
      let publishOccCallCount = 0;

      const publishedPlanDetail: ProgrammeWorkspaceDetailResponse = {
        ...mockMasterDetailDraft,
        plan: {
          ...mockMasterDetailDraft.plan!,
          status: 'PUBLISHED',
        },
      };

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) return jsonResponse(mockOptions);
        if (url.includes('/workspace/masters/master-hdtn-1')) return jsonResponse(publishedPlanDetail);
        if (url.includes('/occurrences/occ-uuid-1/publish')) {
          publishOccCallCount++;
          if (publishOccCallCount === 1) {
            return Promise.reject(new TypeError('Network connection lost'));
          }
          return jsonResponse({ id: 'occ-uuid-1', status: 'PUBLISHED' });
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      await user.click(await screen.findByRole('button', { name: /Rà soát & Vận hành/ }));
      await user.click(await screen.findByRole('button', { name: 'Chọn xem chi tiết' }));

      // Occurrence is DRAFT in PUBLISHED plan -> click "Ban hành hoạt động"
      const publishOccBtn = await screen.findByRole('button', { name: 'Ban hành hoạt động' });

      // 1st click: network failure
      await user.click(publishOccBtn);
      expect(await screen.findByText(/Không thể kết nối đến máy chủ/)).toBeInTheDocument();

      // 2nd click: retry exact occurrence publish
      await user.click(publishOccBtn);
      await waitFor(() => {
        expect(publishOccCallCount).toBe(2);
      });

      const occCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/occurrences/occ-uuid-1/publish'));
      expect(occCalls).toHaveLength(2);
      const body1 = JSON.parse(String(occCalls[0][1].body));
      const body2 = JSON.parse(String(occCalls[1][1].body));
      expect(body1.commandId).toBeTruthy();
      expect(body2.commandId).toBe(body1.commandId);
    });

    it('C. Materialize occurrence: keeps same commandId across network error retry (ApiError status 0)', async () => {
      const user = userEvent.setup();
      let matCallCount = 0;

      const publishedOccDetail: ProgrammeWorkspaceDetailResponse = {
        ...mockMasterDetailDraft,
        plan: {
          ...mockMasterDetailDraft.plan!,
          status: 'PUBLISHED',
        },
        occurrences: [
          {
            ...mockMasterDetailDraft.occurrences[0],
            status: 'PUBLISHED',
            lifecycleSummary: {
              ...mockMasterDetailDraft.occurrences[0].lifecycleSummary,
              materialized: false,
            },
          },
        ],
      };

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) return jsonResponse(mockOptions);
        if (url.includes('/workspace/masters/master-hdtn-1')) return jsonResponse(publishedOccDetail);
        if (url.includes('/occurrences/occ-uuid-1/materialize')) {
          matCallCount++;
          if (matCallCount === 1) {
            return Promise.reject(new TypeError('Network offline'));
          }
          return jsonResponse([{ id: 'mat-result-1' }]);
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      await user.click(await screen.findByRole('button', { name: /Rà soát & Vận hành/ }));
      await user.click(await screen.findByRole('button', { name: 'Chọn xem chi tiết' }));

      // Occurrence is PUBLISHED and not materialized -> open materialize modal
      const matBtn = await screen.findByRole('button', { name: 'Đưa vào lịch hoạt động' });
      await user.click(matBtn);

      const confirmMatBtn = screen.getByRole('button', { name: 'Xác nhận đưa vào lịch' });

      // 1st click: network failure
      await user.click(confirmMatBtn);
      expect(await screen.findByText(/Không thể kết nối đến máy chủ/)).toBeInTheDocument();

      // 2nd click: retry exact materialize
      await user.click(confirmMatBtn);
      await waitFor(() => {
        expect(matCallCount).toBe(2);
      });

      const matCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/occurrences/occ-uuid-1/materialize'));
      expect(matCalls).toHaveLength(2);
      const body1 = JSON.parse(String(matCalls[0][1].body));
      const body2 = JSON.parse(String(matCalls[1][1].body));
      expect(body1.commandId).toBeTruthy();
      expect(body2.commandId).toBe(body1.commandId);
    });

    it('D. Definitive HTTP 409 error clears old commandId and generates a fresh one for new action', async () => {
      const user = userEvent.setup();
      let publishCallCount = 0;

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) return jsonResponse(mockOptions);
        if (url.includes('/workspace/masters/master-hdtn-1')) return jsonResponse(mockMasterDetailDraft);
        if (url.includes('/plan-versions/plan-hdtn-1/publish')) {
          publishCallCount++;
          if (publishCallCount === 1) {
            // Definitive conflict error
            return jsonResponse({ message: 'Revision conflict' }, 409);
          }
          return jsonResponse({ id: 'plan-hdtn-1', status: 'PUBLISHED' });
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      await user.click(await screen.findByRole('button', { name: /Rà soát & Vận hành/ }));
      await user.click(await screen.findByRole('button', { name: 'Chọn xem chi tiết' }));

      await user.click(await screen.findByRole('button', { name: 'Ban hành kế hoạch' }));
      const confirmPublishBtn = screen.getByRole('button', { name: 'Xác nhận ban hành' });

      // 1st click: definitive 409 response
      await user.click(confirmPublishBtn);
      expect(await screen.findByText(/Phiên bản kế hoạch đã thay đổi trước khi ban hành/)).toBeInTheDocument();

      // 2nd click: subsequent attempt after definitive failure
      await user.click(confirmPublishBtn);
      await waitFor(() => {
        expect(publishCallCount).toBe(2);
      });

      const publishCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/plan-versions/plan-hdtn-1/publish'));
      expect(publishCalls).toHaveLength(2);
      const body1 = JSON.parse(String(publishCalls[0][1].body));
      const body2 = JSON.parse(String(publishCalls[1][1].body));
      expect(body1.commandId).toBeTruthy();
      expect(body2.commandId).toBeTruthy();
      // MUST NOT reuse the old commandId after definitive 409 error
      expect(body2.commandId).not.toBe(body1.commandId);
    });

    it('E. HĐTN confirm network failure: retry exact preview reuses same commandId', async () => {
      const user = userEvent.setup();
      let confirmCallCount = 0;

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) return jsonResponse(mockOptions);
        if (url.includes('/hdtn-import/preview')) return jsonResponse(mockHdtnPreview);
        if (url.includes('/hdtn-import/confirm')) {
          confirmCallCount++;
          if (confirmCallCount === 1) {
            return Promise.reject(new TypeError('Network dropped'));
          }
          return jsonResponse(mockHdtnConfirm);
        }
        if (url.includes('/workspace/masters/master-hdtn-1')) return jsonResponse(mockMasterDetailDraft);
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      // Select file and preview
      const file = new File(['mock content'], 'hdtn_sample.xlsx');
      fireEvent.change(await screen.findByLabelText('Chọn tệp Excel (.xlsx)'), { target: { files: [file] } });
      await user.click(screen.getByRole('button', { name: 'Xem trước kế hoạch' }));

      // Open confirm dialog
      await user.click(await screen.findByRole('button', { name: 'Xác nhận tạo bản nháp' }));
      const saveDraftBtn = screen.getByRole('button', { name: 'Xác nhận lưu bản nháp' });

      // 1st click: network failure
      await user.click(saveDraftBtn);
      expect(await screen.findByText(/Không thể kết nối đến máy chủ/)).toBeInTheDocument();

      // 2nd click: retry exact confirm action
      await user.click(saveDraftBtn);
      await waitFor(() => {
        expect(confirmCallCount).toBe(2);
      });

      const confirmCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/hdtn-import/confirm'));
      expect(confirmCalls).toHaveLength(2);
      const form1 = confirmCalls[0][1].body as FormData;
      const form2 = confirmCalls[1][1].body as FormData;
      const cmd1 = form1.get('commandId');
      const cmd2 = form2.get('commandId');
      expect(cmd1).toBeTruthy();
      expect(cmd2).toBe(cmd1);
    });

    it('F. HĐTN failed action commandId is isolated and never reused by GDĐP confirm', async () => {
      const user = userEvent.setup();

      const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/options')) return jsonResponse(mockOptions);
        if (url.includes('/hdtn-import/preview')) return jsonResponse(mockHdtnPreview);
        if (url.includes('/hdtn-import/confirm')) {
          return Promise.reject(new TypeError('Network error'));
        }
        if (url.includes('/gddp-import/preview')) return jsonResponse(mockGddpPreview);
        if (url.includes('/gddp-import/confirm')) return jsonResponse(mockGddpConfirm);
        if (url.includes('/workspace/masters/master-gddp-10')) {
          return jsonResponse({
            ...mockMasterDetailDraft,
            master: { ...mockMasterDetailDraft.master, id: 'master-gddp-10', label: 'GDĐP Khối 10' },
          });
        }
        return jsonResponse({});
      });
      vi.stubGlobal('fetch', fetchMock);

      renderWithQuery(<SpecialProgrammeWorkspacePage />);

      // 1. Trigger HĐTN confirm failure
      const hdtnFile = new File(['hdtn'], 'hdtn.xlsx');
      fireEvent.change(await screen.findByLabelText('Chọn tệp Excel (.xlsx)'), { target: { files: [hdtnFile] } });
      await user.click(screen.getByRole('button', { name: 'Xem trước kế hoạch' }));
      await user.click(await screen.findByRole('button', { name: 'Xác nhận tạo bản nháp' }));
      await user.click(screen.getByRole('button', { name: 'Xác nhận lưu bản nháp' }));

      expect(await screen.findByText(/Không thể kết nối đến máy chủ/)).toBeInTheDocument();

      const hdtnCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/hdtn-import/confirm'));
      expect(hdtnCalls).toHaveLength(1);
      const hdtnCmd = (hdtnCalls[0][1].body as FormData).get('commandId');
      expect(hdtnCmd).toBeTruthy();

      // 2. Switch to GDĐP tab
      await user.click(screen.getByRole('button', { name: 'Giáo dục địa phương (GDĐP)' }));
      const gddpFile = new File(['gddp'], 'gddp.xlsx');
      fireEvent.change(screen.getByLabelText('Chọn tệp Excel (.xlsx)'), { target: { files: [gddpFile] } });
      await user.click(screen.getByRole('button', { name: 'Xem trước kế hoạch' }));
      await user.click(await screen.findByRole('button', { name: 'Xác nhận tạo bản nháp' }));
      await user.click(screen.getByRole('button', { name: 'Xác nhận lưu bản nháp' }));

      // Wait for GDĐP confirm to be called
      await waitFor(() => {
        const gddpCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/gddp-import/confirm'));
        expect(gddpCalls).toHaveLength(1);
      });

      const gddpCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('/gddp-import/confirm'));
      const gddpCmd = (gddpCalls[0][1].body as FormData).get('commandId');
      expect(gddpCmd).toBeTruthy();

      // Strict isolation check: GDĐP confirm commandId MUST NOT equal HĐTN commandId
      expect(gddpCmd).not.toBe(hdtnCmd);
    });
  });
});
