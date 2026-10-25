import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DispositionPreviewPanel } from '../pages/DispositionPreviewPanel';
import { OperationalHistoryPanel } from '../pages/OperationalHistoryPanel';
import { SpecialProgrammeWorkspacePage } from '../pages/SpecialProgrammeWorkspacePage';
import { operationalOverlaysApi, type OperationalSourceOccurrence } from '../lib/operational-overlays-api';
import { ApiError } from '../lib/api-client';
import { firstLoginAuth, jsonResponse, normalAuth, renderApp, renderWithQuery } from './test-utils';

const context = { years: [], subjects: [], permissions: { calendarSchoolWide: true, teachingSchoolWide: true, teachingSubjectIds: [] } };
const items: OperationalSourceOccurrence[] = [{
  occurrenceKey: 'NORMAL:e:2026-10-22', academicCalendarVersionId: 'cal', timetableEntryId: 'e', civilDate: '2026-10-22',
  schoolClassId: 'c', schoolClassName: '10A1', subjectId: 's', subjectName: 'Toán', gradeLevel: 10,
  responsibleTeacherUserId: 't', responsibleTeacherName: 'Giáo viên A', selectable: true, effectiveKind: 'BASE_TIMETABLE',
  slot: { id: 'slot', weekday: 'THURSDAY', session: 'MORNING', startTime: '07:00', endTime: '07:45' },
}];
const safeCopy = { 401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 403: 'Tài khoản chưa được cấp quyền thực hiện thao tác này.', 404: 'Không tìm thấy dữ liệu được yêu cầu. Hãy tải lại danh sách.', 409: 'Dữ liệu xung đột với bản ghi hiện có hoặc đã thay đổi. Hãy tải lại dữ liệu và kiểm tra trước khi lưu.', 500: 'Không thể hoàn tất yêu cầu. Hãy kiểm tra kết nối và thử lại.' };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('P5-058 final slice: safe presentation without workflow mutation', () => {
  for (const status of [401, 403, 404, 409, 500] as const) {
    it(`disposition HTTP ${status} preserves note, command and manual retry`, async () => {
      const preview = vi.spyOn(operationalOverlaysApi, 'previewDisposition').mockRejectedValue(new ApiError(status, 'SQL_INTERNAL secret-host'));
      const { container } = renderWithQuery(<DispositionPreviewPanel context={context} yearId="y" civilDate="2026-10-22" items={items} />);
      fireEvent.change(screen.getByLabelText(/Ghi chú, lý do/), { target: { value: 'Lý do đã nhập' } });
      fireEvent.click(screen.getByRole('button', { name: 'Xem trước phân công xử lý' }));
      expect(await screen.findByText(safeCopy[status])).toBeInTheDocument();
      expect(screen.getByLabelText(/Ghi chú, lý do/)).toHaveValue('Lý do đã nhập');
      expect(preview).toHaveBeenCalledTimes(1);
      expect(preview).toHaveBeenCalledWith({ academicYearId: 'y', subjectId: 's', timetableEntryId: 'e', sourceCivilDate: '2026-10-22', dispositionType: 'ABSENCE_NO_REPLACEMENT', note: 'Lý do đã nhập' });
      expect(container.textContent).not.toMatch(/SQL_INTERNAL|secret-host/);
    });
    it(`history HTTP ${status} never looks empty`, async () => {
      const load = vi.spyOn(operationalOverlaysApi, 'listCalendarExceptions').mockRejectedValue(new ApiError(status, 'SQL_INTERNAL secret-host'));
      vi.spyOn(operationalOverlaysApi, 'listLessonDispositions').mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, collisionCoverage: { profile: 'CANONICAL_CLASS_TEACHER_TIME_V1', specialActivity: 'ASSESSED', room: 'NOT_ASSESSED' } });
      const { container } = renderWithQuery(<OperationalHistoryPanel context={context} yearId="y" subjectId="" />);
      expect(screen.queryByText('Chưa có bản ghi điều hành')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Tải lịch sử điều hành' }));
      expect(await screen.findByText(safeCopy[status])).toBeInTheDocument();
      expect(screen.queryByText('Chưa có bản ghi điều hành')).not.toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(1);
      expect(container.textContent).not.toMatch(/SQL_INTERNAL|secret-host/);
    });
    it(`programme inspect HTTP ${status} is safe and not retried automatically`, async () => {
      const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/workspace/options')
        ? jsonResponse({ academicYears: [{ id: 'y', code: '2026', name: 'Năm học 2026' }], masters: [] })
        : jsonResponse({ message: 'SQL_INTERNAL secret-host' }, status));
      vi.stubGlobal('fetch', fetcher);
      const { container } = renderWithQuery(<SpecialProgrammeWorkspacePage />);
      fireEvent.change(await screen.findByLabelText('Chọn tệp Excel (.xlsx)'), { target: { files: [new File(['test'], 'ke-hoach.xlsx')] } });
      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra tệp' }));
      expect(await screen.findByText(safeCopy[status])).toBeInTheDocument();
      expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/inspect'))).toHaveLength(1);
      expect(container.textContent).not.toMatch(/SQL_INTERNAL|secret-host/);
    });
  }

  it('distinguishes teacher options empty from loading and suppresses blocked raw reasons', async () => {
    const options = vi.spyOn(operationalOverlaysApi, 'getTeacherOptions').mockResolvedValueOnce({ status: 'OPTIONS_NOT_COLLISION_CHECKED', items: [] }).mockResolvedValueOnce({ status: 'BLOCKED', items: [], reason: 'SQL_INTERNAL secret-host' });
    const { container } = renderWithQuery(<DispositionPreviewPanel context={context} yearId="y" civilDate="2026-10-22" items={items} />);
    fireEvent.change(screen.getByLabelText('Phương án xử lý'), { target: { value: 'SAME_SUBJECT_SUBSTITUTION' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm giáo viên có thể lựa chọn' }));
    expect(await screen.findByText('Chưa có giáo viên phù hợp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem trước phân công xử lý' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tìm giáo viên có thể lựa chọn' }));
    expect(await screen.findByText('Danh sách bị chặn')).toBeInTheDocument();
    expect(options).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toMatch(/SQL_INTERNAL|secret-host/);
  });

  it('unknown history status is not represented as reversed and has no reversal action', async () => {
    vi.spyOn(operationalOverlaysApi, 'listCalendarExceptions').mockResolvedValue({ items: [{ id: 'x', civilDate: '2026-10-22', status: 'UNKNOWN_RAW' }], total: 1, page: 1, pageSize: 50 } as never);
    const { container } = renderWithQuery(<OperationalHistoryPanel context={{ ...context, permissions: { ...context.permissions, teachingSchoolWide: false } }} yearId="y" subjectId="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tải lịch sử điều hành' }));
    expect(await screen.findByText('Chưa xác định trạng thái')).toBeInTheDocument();
    expect(screen.queryByText('Đã hoàn tác')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('UNKNOWN_RAW');
  });

  for (const firstLogin of [false, true]) it(`auth 403 guides user safely, first login=${firstLogin}`, async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('/auth/me') ? (firstLogin ? jsonResponse(firstLoginAuth) : jsonResponse({}, 401)) : jsonResponse({ message: 'SQL_INTERNAL secret-host' }, 403));
    vi.stubGlobal('fetch', fetcher);
    const { container } = renderApp(firstLogin ? '/doi-mat-khau-lan-dau' : '/dang-nhap');
    if (firstLogin) {
      fireEvent.change(await screen.findByLabelText('Mật khẩu hiện tại'), { target: { value: 'CurrentPassword123' } });
      fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'ReplacementPassword123' } });
      fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), { target: { value: 'ReplacementPassword123' } });
    } else {
      fireEvent.change(await screen.findByLabelText('Tên đăng nhập'), { target: { value: 'teacher' } });
      fireEvent.change(screen.getByLabelText('Mật khẩu', { exact: true }), { target: { value: 'Password123456' } });
    }
    fireEvent.click(screen.getByRole('button', { name: firstLogin ? 'Đổi mật khẩu' : 'Đăng nhập' }));
    expect(await screen.findByText(firstLogin ? /Tài khoản chưa được phép đổi mật khẩu/ : /Tài khoản chưa được phép đăng nhập/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/SQL_INTERNAL|secret-host/);
  });

  it('scoped duty history hides unavailable names and future assignment is not ended', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/auth/me')) return jsonResponse({ ...normalAuth, capabilities: [{ key: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', scope: 'SUBJECT_GROUP', resourceId: 'hidden-group' }] });
      if (String(url).includes('/staff-additional-duty-assignments')) return jsonResponse({ items: [{ id: 'a', staffProfileId: 'hidden-staff', dutyDefinitionId: 'hidden-duty', scopeType: 'SUBJECT_GROUP', scopeResourceId: 'hidden-group', validFrom: '2099-01-01T00:00:00Z', validUntil: null }], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
    }));
    const { container } = renderApp('/quan-tri/kiem-nhiem/phan-cong');
    expect(await screen.findByText('Chưa tới thời điểm hiệu lực')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo phân công' })).toBeDisabled();
    expect(container.textContent).not.toMatch(/hidden-staff|hidden-duty|hidden-group|UUID/);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa hiệu lực' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Điều chỉnh phân công' })).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/hidden-staff|hidden-duty|hidden-group/);
  });
});
