import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const academicAuth = { ...normalAuth, capabilities: [{ key: 'ACADEMIC_STRUCTURE_MANAGE' as const, scope: 'SCHOOL_WIDE' as const }] };
const year = { id: 'year-1', code: '2026-2027', name: 'Năm học 2026–2027', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const versionSummary = { id: 'version-1', academicYearId: year.id, versionNumber: 1, startDate: '2026-08-31', endDate: '2026-09-04', officialWeekCount: 1, reserveWeekCount: 0, teachingWeekdays: ['MONDAY'], isActive: false, activatedAt: null, note: null, createdAt: '', updatedAt: '' };
const versionDetail = { ...versionSummary, semesters: [{ id: 'semester-1', code: 'HK1', name: 'Học kỳ 1', ordinal: 1, startDate: '2026-08-31', endDate: '2026-09-04', createdAt: '', updatedAt: '' }], weeks: [{ id: 'week-1', kind: 'OFFICIAL', officialWeekNumber: 1, reserveWeekNumber: null, displayLabel: 'Tuần 1', sortOrder: 1, segments: [{ id: 'segment-1', label: '1', segmentOrder: 1, startDate: '2026-08-31', endDate: '2026-09-04', createdAt: '', updatedAt: '' }], createdAt: '', updatedAt: '' }], interruptions: [] };

async function fillMinimalCalendar() {
  await userEvent.type(screen.getByLabelText('Ngày bắt đầu', { selector: 'input[name="calendar-start"]' }), '2026-08-31');
  await userEvent.type(screen.getByLabelText('Ngày kết thúc', { selector: 'input[name="calendar-end"]' }), '2026-09-04');
  await userEvent.type(screen.getByLabelText('Số tuần chính thức'), '1');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Thứ Hai' }));
  await userEvent.click(screen.getByRole('button', { name: 'Thêm học kỳ' }));
  await userEvent.type(screen.getByLabelText('Mã học kỳ'), 'HK1');
  await userEvent.type(screen.getByLabelText('Tên học kỳ'), 'Học kỳ 1');
  await userEvent.type(screen.getByLabelText('Ngày bắt đầu', { selector: 'input[name="semester-start-0"]' }), '2026-08-31');
  await userEvent.type(screen.getByLabelText('Ngày kết thúc', { selector: 'input[name="semester-end-0"]' }), '2026-09-04');
  await userEvent.click(screen.getByRole('button', { name: 'Sinh khung tuần' }));
  await userEvent.click(screen.getByText('Tuần chính thức 1 · thứ tự 1', { selector: 'summary' }));
  await userEvent.clear(screen.getByLabelText('Nhãn khoảng')); await userEvent.type(screen.getByLabelText('Nhãn khoảng'), '1');
  await userEvent.type(screen.getByLabelText('Ngày bắt đầu', { selector: 'input[name="segment-start-0-0"]' }), '2026-08-31');
  await userEvent.type(screen.getByLabelText('Ngày kết thúc', { selector: 'input[name="segment-end-0-0"]' }), '2026-09-04');
}

describe('academic structure pages', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('renders the empty academic register and create form', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me') ? jsonResponse(academicAuth) : jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 })));
    renderApp('/quan-tri/cau-truc-nam-hoc');
    expect(await screen.findByRole('heading', { name: 'Cấu trúc năm học' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Chưa có năm học' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo năm học' }));
    expect(screen.getByLabelText('Mã năm học')).toHaveAttribute('required');
    expect(screen.queryByRole('button', { name: /xóa/i })).not.toBeInTheDocument();
  });

  it('generates and resets an explicit week skeleton without selecting weekdays', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); if (url.endsWith('/auth/me')) return jsonResponse(academicAuth); if (url.endsWith('/academic-years/year-1')) return jsonResponse(year);
      return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 });
    }));
    renderApp('/quan-tri/cau-truc-nam-hoc/year-1/lich');
    expect(await screen.findByRole('heading', { name: year.name })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo phiên lịch' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(7); expect(screen.getAllByRole('checkbox').every((box) => !(box as HTMLInputElement).checked)).toBe(true);
    await userEvent.type(screen.getByLabelText('Số tuần chính thức'), '2');
    await userEvent.clear(screen.getByLabelText('Số tuần dự phòng')); await userEvent.type(screen.getByLabelText('Số tuần dự phòng'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Sinh khung tuần' }));
    expect(screen.getAllByText(/Tuần (chính thức|dự phòng) \d+ · thứ tự/, { selector: 'summary' })).toHaveLength(3);
    expect(screen.getByDisplayValue('DP1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loại tuần')).not.toBeInTheDocument();
    const secondWeek = screen.getByText('Tuần chính thức 2 · thứ tự 2', { selector: 'summary' }).closest('details')!;
    await userEvent.click(within(secondWeek).getByText('Tuần chính thức 2 · thứ tự 2'));
    await userEvent.click(within(secondWeek).getByRole('button', { name: 'Đưa lên' }));
    expect(screen.getAllByText(/Tuần (chính thức|dự phòng) \d+ · thứ tự/, { selector: 'summary' })[0]).toHaveTextContent('Tuần chính thức 2 · thứ tự 1');
    expect(screen.getByLabelText('Số tuần chính thức')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại khung tuần' }));
    expect(screen.getByText('Đặt lại sẽ xóa toàn bộ tuần và khoảng đã nhập.')).toBeInTheDocument();
    expect(screen.getAllByText(/Tuần (chính thức|dự phòng) \d+ · thứ tự/, { selector: 'summary' })).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận đặt lại' }));
    expect(screen.queryByText(/Tuần chính thức \d+ · thứ tự/, { selector: 'summary' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Số tuần chính thức')).toBeEnabled();
  });

  it('keeps class records year-scoped and exposes status confirmation without delete', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => { const url = String(input); if (url.endsWith('/auth/me')) return jsonResponse(academicAuth); if (url.endsWith('/academic-years/year-1')) return jsonResponse(year); return jsonResponse({ items: [{ id: 'class-1', academicYearId: 'year-1', code: '10A1', name: 'Lớp 10A1', gradeLevel: 10, status: 'ACTIVE', createdAt: '', updatedAt: '' }], page: 1, pageSize: 20, total: 1 }); });
    vi.stubGlobal('fetch', fetchMock); renderApp('/quan-tri/cau-truc-nam-hoc/year-1/lop');
    const table = await screen.findByRole('region', { name: 'Sổ lớp học' }); expect(within(table).getByText('Lớp 10A1')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/academic-years/year-1/classes'))).toBe(true);
    await userEvent.click(within(table).getByRole('button', { name: 'Vô hiệu hóa' }));
    expect(within(table).getByText('Xác nhận vô hiệu hóa?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xóa/i })).not.toBeInTheDocument();
  });

  it('renders a safe missing-year state with a real return action', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me') ? jsonResponse(academicAuth) : jsonResponse({ statusCode: 404, message: 'internal detail' }, 404)));
    renderApp('/quan-tri/cau-truc-nam-hoc/missing-year/lich');
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy năm học này.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trở về sổ năm học' })).toHaveAttribute('href', '/quan-tri/cau-truc-nam-hoc');
    expect(screen.queryByText('internal detail')).not.toBeInTheDocument();
  });

  it('renders a safe missing-version state and returns to the version list', async () => {
    const version = { id: 'version-missing', academicYearId: year.id, versionNumber: 2, startDate: '2026-08-31', endDate: '2026-09-04', officialWeekCount: 1, reserveWeekCount: 0, teachingWeekdays: ['MONDAY'], isActive: false, activatedAt: null, note: null, createdAt: '', updatedAt: '' };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => { const url = String(input); if (url.endsWith('/auth/me')) return jsonResponse(academicAuth); if (url.endsWith('/academic-years/year-1')) return jsonResponse(year); if (url.includes('/academic-years/year-1/calendar-versions')) return jsonResponse({ items: [version], page: 1, pageSize: 20, total: 1 }); return jsonResponse({ statusCode: 404, message: 'internal detail' }, 404); }));
    renderApp('/quan-tri/cau-truc-nam-hoc/year-1/lich');
    await userEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết Phiên 2' }));
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy phiên lịch này.' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Trở về danh sách phiên lịch' }));
    expect(await screen.findByRole('region', { name: 'Các phiên lịch năm học' })).toBeInTheDocument();
  });

  it('keeps network failures retryable instead of presenting a missing resource', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => { if (String(input).endsWith('/auth/me')) return jsonResponse(academicAuth); throw new TypeError('offline'); });
    vi.stubGlobal('fetch', fetchMock); renderApp('/quan-tri/cau-truc-nam-hoc/year-1/lich');
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText('Không tìm thấy năm học này.')).not.toBeInTheDocument();
  });

  it('renders AcademicYear updatedAt in the configured business timezone', async () => {
    const datedYear = { ...year, updatedAt: '2026-01-01T17:30:00Z' };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me') ? jsonResponse(academicAuth) : jsonResponse({ items: [datedYear], page: 1, pageSize: 20, total: 1 })));
    renderApp('/quan-tri/cau-truc-nam-hoc');
    expect(await screen.findByText('00:30 2/1/26')).toBeInTheDocument();
  });

  it('clears a failed calendar create before a successful activation and preserves the failed draft', async () => {
    let activated = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/me')) return jsonResponse(academicAuth);
      if (url.endsWith('/academic-years/year-1')) return jsonResponse(year);
      if (url.includes('/academic-years/year-1/calendar-versions') && method === 'GET') return jsonResponse({ items: [{ ...versionSummary, isActive: activated }], page: 1, pageSize: 20, total: 1 });
      if (url.includes('/academic-years/year-1/calendar-versions') && method === 'POST') return jsonResponse({ statusCode: 400, message: 'Lịch chưa phủ đủ ngày dạy.' }, 400);
      if (url.endsWith('/academic-calendar-versions/version-1/activate')) { activated = true; return jsonResponse({ ...versionDetail, isActive: true, activatedAt: '2026-08-01T00:00:00Z' }); }
      if (url.endsWith('/academic-calendar-versions/version-1')) return jsonResponse({ ...versionDetail, isActive: activated });
      return jsonResponse({ statusCode: 404, message: 'missing' }, 404);
    }));
    renderApp('/quan-tri/cau-truc-nam-hoc/year-1/lich');
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo phiên lịch' })); await fillMinimalCalendar();
    await userEvent.click(screen.getAllByRole('button', { name: 'Tạo phiên lịch' }).at(-1)!);
    expect(await screen.findByText('Lịch chưa phủ đủ ngày dạy.')).toBeInTheDocument();
    expect(screen.getByLabelText('Ngày bắt đầu', { selector: 'input[name="calendar-start"]' })).toHaveValue('2026-08-31');
    await userEvent.click(screen.getByRole('button', { name: 'Hủy bản nháp' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Kích hoạt Phiên 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận kích hoạt Phiên 1' }));
    expect(await screen.findByText('Đã kích hoạt phiên 1.')).toBeInTheDocument();
    expect(screen.queryByText('Lịch chưa phủ đủ ngày dạy.')).not.toBeInTheDocument();
  });

  it('clears a failed template request before creating a new calendar', async () => {
    let templateFailed = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/me')) return jsonResponse(academicAuth);
      if (url.endsWith('/academic-years/year-1')) return jsonResponse(year);
      if (url.includes('/academic-years/year-1/calendar-versions') && method === 'GET') return jsonResponse({ items: [versionSummary], page: 1, pageSize: 20, total: 1 });
      if (url.includes('/academic-years/year-1/calendar-versions') && method === 'POST') return jsonResponse(versionDetail, 201);
      if (url.endsWith('/academic-calendar-versions/version-1') && !templateFailed) { templateFailed = true; return jsonResponse({ statusCode: 503, message: 'internal' }, 503); }
      if (url.endsWith('/academic-calendar-versions/version-1')) return jsonResponse(versionDetail);
      return jsonResponse({ statusCode: 404, message: 'missing' }, 404);
    }));
    renderApp('/quan-tri/cau-truc-nam-hoc/year-1/lich');
    await userEvent.click(await screen.findByRole('button', { name: 'Dùng Phiên 1 làm mẫu' }));
    expect(await screen.findByText('Không thể hoàn tất yêu cầu. Hãy thử lại khi kết nối ổn định.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo phiên lịch' }));
    expect(screen.queryByText('Không thể hoàn tất yêu cầu. Hãy thử lại khi kết nối ổn định.')).not.toBeInTheDocument();
    await fillMinimalCalendar(); await userEvent.click(screen.getAllByRole('button', { name: 'Tạo phiên lịch' }).at(-1)!);
    expect(await screen.findByText('Đã tạo phiên lịch mới. Phiên này được giữ bất biến.')).toBeInTheDocument();
  });

  it('clears competing class mutation errors after later successful operations', async () => {
    let saveAttempts = 0; let actionAttempts = 0;
    const row = { id: 'class-1', academicYearId: year.id, code: '10A1', name: 'Lớp 10A1', gradeLevel: 10, status: 'ACTIVE', createdAt: '', updatedAt: '' };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); const method = init?.method ?? 'GET'; if (url.endsWith('/auth/me')) return jsonResponse(academicAuth); if (url.endsWith('/academic-years/year-1')) return jsonResponse(year); if (url.includes('/academic-years/year-1/classes') && method === 'GET') return jsonResponse({ items: [row], page: 1, pageSize: 20, total: 1 }); if (url.includes('/academic-years/year-1/classes') && method === 'POST') return ++saveAttempts === 1 ? jsonResponse({ statusCode: 409, message: 'conflict' }, 409) : jsonResponse({ ...row, id: 'class-2', code: '10A2' }, 201); if (url.endsWith('/school-classes/class-1/deactivate')) return ++actionAttempts === 1 ? jsonResponse({ ...row, status: 'INACTIVE' }) : jsonResponse({ statusCode: 409, message: 'conflict' }, 409); return jsonResponse({ statusCode: 404, message: 'missing' }, 404); }));
    renderApp('/quan-tri/cau-truc-nam-hoc/year-1/lop');
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo lớp' })); await userEvent.type(screen.getByLabelText('Mã lớp'), '10A2'); await userEvent.type(screen.getByLabelText('Tên lớp'), 'Lớp 10A2'); await userEvent.click(screen.getByRole('button', { name: 'Lưu lớp học' }));
    expect(await screen.findByText(/Dữ liệu xung đột/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' })); await userEvent.click(screen.getByRole('button', { name: 'Vô hiệu hóa' })); await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Đã cập nhật trạng thái lớp; lịch sử vẫn được giữ.')).toBeInTheDocument(); expect(screen.queryByText(/Dữ liệu xung đột/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vô hiệu hóa' })); await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' })); expect(await screen.findByText(/Dữ liệu xung đột/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo lớp' })); await userEvent.type(screen.getByLabelText('Mã lớp'), '10A2'); await userEvent.type(screen.getByLabelText('Tên lớp'), 'Lớp 10A2'); await userEvent.click(screen.getByRole('button', { name: 'Lưu lớp học' }));
    expect(await screen.findByText('Đã lưu lớp học.')).toBeInTheDocument(); expect(screen.queryByText(/Dữ liệu xung đột/)).not.toBeInTheDocument();
  });
});
