import type { DataReadinessSummaryResponse } from '@baogiang/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const route = '/quan-tri/san-sang-du-lieu';

const principalAuth = {
  ...normalAuth,
  user: { ...normalAuth.user, id: 'user-principal', username: 'hieutruong', displayName: 'Hiệu trưởng Đam San' },
  capabilities: [{ key: 'APPROVAL_PRINCIPAL' as const, scope: 'SCHOOL_WIDE' as const }],
};

const adminAuth = {
  ...normalAuth,
  user: { ...normalAuth.user, id: 'user-admin', username: 'admin', displayName: 'Quản trị viên' },
  capabilities: [{ key: 'USER_MANAGE' as const, scope: 'SCHOOL_WIDE' as const }],
};

const teacherOnlyAuth = {
  ...normalAuth,
  user: { ...normalAuth.user, id: 'user-teacher', username: 'teacher' },
  capabilities: [{ key: 'TEACHER_BASE' as const, scope: 'PERSONAL' as const }],
};

const mockSummary: DataReadinessSummaryResponse = {
  academicYear: {
    id: 'year-2026',
    code: '2026-2027',
    name: 'Năm học 2026-2027',
  },
  academicYears: [
    { id: 'year-2026', code: '2026-2027', name: 'Năm học 2026-2027' },
    { id: 'year-2025', code: '2025-2026', name: 'Năm học 2025-2026' },
  ],
  overallStatus: 'ATTENTION_REQUIRED',
  overallStatusLabel: 'Cần can thiệp xử lý trước vận hành',
  evaluatedAt: '2026-10-23T08:00:00.000Z',
  domains: [
    {
      key: 'TKB',
      label: 'Thời khóa biểu (TKB)',
      description: 'Thời khóa biểu phân phối các tiết học theo tuần, buổi và khung tiết.',
      status: 'READY',
      statusLabel: 'Đã ban hành & sẵn sàng',
      latestVersion: {
        number: 1,
        status: 'PUBLISHED',
        statusLabel: 'Đã ban hành',
        effectiveRange: 'Từ tuần 1 đến tuần 35',
        updatedAt: '2026-09-01T07:30:00.000Z',
      },
      latestImport: null,
      findings: [],
      nextAction: 'Theo dõi các yêu cầu dạy thay hoặc ngoại lệ phát sinh nếu có.',
      primaryAction: {
        label: 'Quản lý Thời khóa biểu & Khung tiết',
        to: '/quan-tri/thoi-khoa-bieu',
      },
      secondaryAction: null,
      workflowSteps: [
        { stepNumber: 1, label: 'Chọn tệp', isCompleted: true, isCurrent: false, isApplicable: true },
        { stepNumber: 2, label: 'Kiểm tra cấu trúc', isCompleted: true, isCurrent: false, isApplicable: true },
        { stepNumber: 3, label: 'Xử lý chưa nhận diện', isCompleted: true, isCurrent: false, isApplicable: true },
        { stepNumber: 4, label: 'Xem trước & đối chiếu', isCompleted: true, isCurrent: false, isApplicable: true },
        { stepNumber: 5, label: 'Xác nhận', isCompleted: true, isCurrent: false, isApplicable: true },
        { stepNumber: 6, label: 'Ban hành', isCompleted: true, isCurrent: false, isApplicable: true },
      ],
      stats: {
        'Tổng số tiết': 840,
        'Số lớp': 9,
      },
    },
    {
      key: 'PPCT',
      label: 'Phân phối chương trình (PPCT)',
      description: 'Khung phân phối số tiết và chuyên đề cho từng môn học theo khối lớp.',
      status: 'ATTENTION_REQUIRED',
      statusLabel: 'Cần nạp phân phối chương trình',
      latestVersion: null,
      latestImport: null,
      findings: [
        {
          code: 'PPCT_MISSING_CORE_SUBJECTS',
          severity: 'BLOCKER',
          message: 'Chưa có phân phối chương trình cho môn học nào trong năm học.',
        },
      ],
      nextAction: 'Thực hiện nạp tệp PPCT cho các tổ bộ môn qua giao diện Nhập PPCT.',
      primaryAction: {
        label: 'Nhập PPCT',
        to: '/quan-tri/ppct/nhap',
      },
      secondaryAction: {
        label: 'Áp dụng chuyên đề',
        to: '/quan-tri/ppct/ap-dung-chuyen-de',
      },
      workflowSteps: [
        { stepNumber: 1, label: 'Chọn tệp', isCompleted: false, isCurrent: true, isApplicable: true },
        { stepNumber: 2, label: 'Kiểm tra cấu trúc', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 3, label: 'Xử lý chưa nhận diện', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 4, label: 'Xem trước & đối chiếu', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 5, label: 'Xác nhận', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 6, label: 'Kích hoạt', isCompleted: false, isCurrent: false, isApplicable: false },
      ],
      stats: {
        'Số môn đã có PPCT': 0,
      },
    },
    {
      key: 'HISTORICAL_TEACHING',
      label: 'Lịch sử giảng dạy',
      description: 'Minh chứng tiết dạy đã thực hiện trước thời điểm đưa phần mềm vào vận hành.',
      status: 'ATTENTION_REQUIRED',
      statusLabel: 'Chưa nạp minh chứng quá khứ',
      latestVersion: null,
      latestImport: null,
      findings: [
        {
          code: 'HISTORICAL_TEACHING_EVIDENCE_PENDING',
          severity: 'BLOCKER',
          message: 'Hệ thống vận hành trễ sau ngày bắt đầu năm học nhưng chưa có đợt nạp minh chứng lịch sử nào được xác nhận.',
        },
      ],
      nextAction: 'Chuẩn bị tệp CSV đối soát lịch sử giảng dạy và nạp qua trang Nạp lịch sử giảng dạy.',
      primaryAction: {
        label: 'Nạp lịch sử giảng dạy',
        to: '/quan-tri/lich-su-giang-day',
      },
      secondaryAction: null,
      workflowSteps: [
        { stepNumber: 1, label: 'Chọn tệp CSV', isCompleted: false, isCurrent: true, isApplicable: true },
        { stepNumber: 2, label: 'Kiểm tra định dạng', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 3, label: 'Đối soát giáo viên', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 4, label: 'Xem trước đối chiếu', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 5, label: 'Xác nhận ghi nhận', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 6, label: 'Kích hoạt', isCompleted: false, isCurrent: false, isApplicable: false },
      ],
      stats: {
        'Số đợt nạp': 0,
        'Số tiết lịch sử': 0,
      },
    },
    {
      key: 'GDDP',
      label: 'Giáo dục địa phương (GDĐP)',
      description: 'Chương trình Giáo dục địa phương theo chủ đề và giáo viên phụ trách.',
      status: 'NOT_READY',
      statusLabel: 'Chưa có kế hoạch được phê duyệt',
      latestVersion: null,
      latestImport: null,
      findings: [
        {
          code: 'GDDP_NO_PLANS_APPROVED',
          severity: 'WARNING',
          message: 'Đã có khung chương trình GDĐP nhưng chưa có phiên bản kế hoạch nào được phê duyệt.',
        },
      ],
      nextAction: 'Lập và phê duyệt kế hoạch chi tiết cho các chủ đề GDĐP.',
      primaryAction: {
        label: 'Quản lý GDĐP & HĐTN-HN',
        to: '/quan-tri/chuong-trinh-dac-thu',
      },
      secondaryAction: null,
      workflowSteps: [
        { stepNumber: 1, label: 'Chọn tệp', isCompleted: false, isCurrent: true, isApplicable: true },
        { stepNumber: 2, label: 'Kiểm tra cấu trúc', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 3, label: 'Xử lý chủ đề', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 4, label: 'Xem trước đối chiếu', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 5, label: 'Xác nhận lưu', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 6, label: 'Phê duyệt', isCompleted: false, isCurrent: false, isApplicable: true },
      ],
      stats: {
        'Số khung chương trình': 3,
        'Kế hoạch phê duyệt': 0,
      },
    },
    {
      key: 'HDTN_HN',
      label: 'Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)',
      description: 'Chương trình HĐTN-HN theo quy mô khối lớp, tuần lễ và phân công nhân sự.',
      status: 'NOT_READY',
      statusLabel: 'Chưa có kế hoạch được phê duyệt',
      latestVersion: null,
      latestImport: null,
      findings: [
        {
          code: 'HDTN_HN_NO_PLANS_APPROVED',
          severity: 'WARNING',
          message: 'Đã có khung chương trình HĐTN-HN nhưng chưa có kế hoạch nào được phê duyệt.',
        },
      ],
      nextAction: 'Lập và phê duyệt kế hoạch chi tiết cho các hoạt động HĐTN-HN.',
      primaryAction: {
        label: 'Quản lý HĐTN-HN & GDĐP',
        to: '/quan-tri/chuong-trinh-dac-thu',
      },
      secondaryAction: null,
      workflowSteps: [
        { stepNumber: 1, label: 'Chọn tệp', isCompleted: false, isCurrent: true, isApplicable: true },
        { stepNumber: 2, label: 'Kiểm tra cấu trúc', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 3, label: 'Xử lý chủ đề', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 4, label: 'Xem trước đối chiếu', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 5, label: 'Xác nhận lưu', isCompleted: false, isCurrent: false, isApplicable: true },
        { stepNumber: 6, label: 'Phê duyệt', isCompleted: false, isCurrent: false, isApplicable: true },
      ],
      stats: {
        'Số khung chương trình': 3,
        'Kế hoạch phê duyệt': 0,
      },
    },
  ],
};

function setupFetch(auth: unknown = principalAuth, summaryData: DataReadinessSummaryResponse | null = mockSummary, errorStatus?: number) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return jsonResponse(auth);
    if (url.includes('/api/data-readiness/summary')) {
      if (errorStatus) {
        return jsonResponse({ message: 'Lỗi máy chủ', statusCode: errorStatus }, errorStatus);
      }
      return jsonResponse(summaryData);
    }
    return jsonResponse({});
  });
}

describe('P5-055 Data Readiness & Import Center Page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders summary and all 5 domains for Principal', async () => {
    global.fetch = setupFetch(principalAuth, mockSummary);
    renderApp(route);

    await waitFor(() => {
      expect(screen.getByTestId('data-readiness-page')).toBeInTheDocument();
    });

    // Check title and eyebrow
    expect(screen.getByText('Trung tâm sẵn sàng dữ liệu & nhập liệu')).toBeInTheDocument();
    expect(screen.getByText('Quản trị dữ liệu nhà trường')).toBeInTheDocument();

    // Check overall health card
    expect(screen.getByTestId('readiness-overall-card')).toBeInTheDocument();
    expect(screen.getByTestId('overall-status-badge')).toHaveTextContent(/Cần can thiệp xử lý trước vận hành/i);
    expect(screen.getByText('1 / 5')).toBeInTheDocument(); // Ready count

    // Check 6-step guidance box
    expect(screen.getByText(/Quy trình 6 bước chuẩn hóa khi nạp dữ liệu nhà trường/i)).toBeInTheDocument();

    // Check all 5 domain cards exist
    expect(screen.getByTestId('domain-card-tkb')).toBeInTheDocument();
    expect(screen.getByTestId('domain-card-ppct')).toBeInTheDocument();
    expect(screen.getByTestId('domain-card-historical_teaching')).toBeInTheDocument();
    expect(screen.getByTestId('domain-card-gddp')).toBeInTheDocument();
    expect(screen.getByTestId('domain-card-hdtn_hn')).toBeInTheDocument();

    // Check TKB details
    expect(screen.getByTestId('domain-status-tkb')).toHaveTextContent(/Đã ban hành & sẵn sàng/i);
    expect(screen.getByText('Phiên bản #1 (Đã ban hành)')).toBeInTheDocument();
    expect(screen.getByTestId('action-tkb')).toHaveAttribute('href', '/quan-tri/thoi-khoa-bieu?tab=import');
    expect(screen.getByTestId('action-tkb')).toHaveTextContent('Nhập TKB Đam San');
    expect(screen.getByText(/Không có cảnh báo hoặc rào cản ngăn cản vận hành/i)).toBeInTheDocument();

    // Check PPCT details
    expect(screen.getByTestId('domain-status-ppct')).toHaveTextContent(/Cần nạp phân phối chương trình/i);
    expect(screen.getByText('[PPCT_MISSING_CORE_SUBJECTS]')).toBeInTheDocument();
    expect(screen.getByTestId('action-ppct')).toHaveAttribute('href', '/quan-tri/ppct/nhap');
    expect(screen.getByTestId('secondary-action-ppct')).toHaveAttribute('href', '/quan-tri/ppct/ap-dung-chuyen-de');

    // Check Historical Teaching details
    expect(screen.getByTestId('domain-status-historical_teaching')).toHaveTextContent(/Chưa nạp minh chứng quá khứ/i);
    expect(screen.getByText('[HISTORICAL_TEACHING_EVIDENCE_PENDING]')).toBeInTheDocument();
    expect(screen.getByTestId('action-historical_teaching')).toHaveAttribute('href', '/quan-tri/lich-su-giang-day');

    // Check GDDP and HDTN_HN actions
    expect(screen.getByTestId('action-gddp')).toHaveAttribute('href', '/quan-tri/chuong-trinh-dac-thu');
    expect(screen.getByTestId('action-hdtn_hn')).toHaveAttribute('href', '/quan-tri/chuong-trinh-dac-thu');
  });

  it('allows Admin with USER_MANAGE capability to access the center', async () => {
    global.fetch = setupFetch(adminAuth, mockSummary);
    renderApp(route);

    await waitFor(() => {
      expect(screen.getByTestId('data-readiness-page')).toBeInTheDocument();
    });

    expect(screen.getByText('Trung tâm sẵn sàng dữ liệu & nhập liệu')).toBeInTheDocument();
  });

  it('redirects unauthorized users (e.g. ordinary teacher) to access-denied page', async () => {
    global.fetch = setupFetch(teacherOnlyAuth, mockSummary);
    renderApp(route);

    await waitFor(() => {
      expect(screen.queryByTestId('data-readiness-page')).not.toBeInTheDocument();
      expect(screen.getByText(/không có quyền/i)).toBeInTheDocument();
    });
  });

  it('handles academic year selection change', async () => {
    const fetchMock = setupFetch(principalAuth, mockSummary);
    global.fetch = fetchMock;
    renderApp(route);

    await waitFor(() => {
      expect(screen.getByLabelText(/Chọn năm học kiểm tra sẵn sàng/i)).toBeInTheDocument();
    });

    const yearSelect = screen.getByLabelText(/Chọn năm học kiểm tra sẵn sàng/i);
    fireEvent.change(yearSelect, { target: { value: 'year-2025' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('academicYearId=year-2025'),
        expect.anything(),
      );
    });
  });

  it('handles refresh button click', async () => {
    const fetchMock = setupFetch(principalAuth, mockSummary);
    global.fetch = fetchMock;
    renderApp(route);

    await waitFor(() => {
      expect(screen.getByLabelText('Làm mới trạng thái dữ liệu')).toBeInTheDocument();
    });

    const refreshBtn = screen.getByLabelText('Làm mới trạng thái dữ liệu');
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      const summaryCalls = fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('/api/data-readiness/summary'),
      );
      expect(summaryCalls.length).toBe(2);
    });
  });

  it('displays error notice and retry button when API fails', async () => {
    global.fetch = setupFetch(principalAuth, null, 500);
    renderApp(route);

    await waitFor(() => {
      expect(screen.getByText('Không thể tải dữ liệu sẵn sàng')).toBeInTheDocument();
      expect(screen.getByText('Thử lại')).toBeInTheDocument();
    });
  });

  it('P5-058: following TKB import from readiness does not grant the principal timetable access', async () => {
    const fetchMock = setupFetch(principalAuth);
    global.fetch = fetchMock;
    renderApp(route);
    fireEvent.click(await screen.findByTestId('action-tkb'));
    expect(await screen.findByRole('heading', { name: /không có quyền/i })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => /timetable-import|timetable-versions/.test(String(input)))).toBe(false);
  });

  it('P5-058: a failed response cannot claim readiness or expose technical content', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
      ? jsonResponse(principalAuth)
      : jsonResponse({ message: 'READY SQL_TECHNICAL_DETAIL', error: 'Forbidden' }, 500));
    renderApp(route);
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent(/READY|SQL_TECHNICAL_DETAIL|Forbidden/);
    expect(screen.queryByTestId('readiness-overall-card')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
