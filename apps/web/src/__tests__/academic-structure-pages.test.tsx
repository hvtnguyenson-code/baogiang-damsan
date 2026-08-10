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

  it('validates normalized AcademicYear values before create or update and sends only meaningful sparse patches', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/me')) return jsonResponse(academicAuth);
      if (url.endsWith('/academic-years/year-1') && method === 'PATCH') return jsonResponse({ ...year, code: '2027-2028' });
      if (url.endsWith('/academic-years') && method === 'POST') return jsonResponse({ ...year, code: '2028-2029', name: 'Năm học mới' }, 201);
      return jsonResponse({ items: [year], page: 1, pageSize: 20, total: 1 });
    });
    vi.stubGlobal('fetch', fetchMock); renderApp('/quan-tri/cau-truc-nam-hoc');
    await screen.findByRole('region', { name: 'Sổ năm học' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo năm học' }));
    await userEvent.type(screen.getByLabelText('Mã năm học'), '   '); await userEvent.type(screen.getByLabelText('Tên năm học'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu năm học' }));
    expect(screen.getByLabelText('Mã năm học')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Tên năm học')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/academic-years') && call[1]?.method === 'POST')).toBe(false);
    await userEvent.clear(screen.getByLabelText('Mã năm học')); await userEvent.type(screen.getByLabelText('Mã năm học'), ' 2028-2029 ');
    await userEvent.clear(screen.getByLabelText('Tên năm học')); await userEvent.type(screen.getByLabelText('Tên năm học'), ' Năm học mới ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu năm học' }));
    const createCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/academic-years') && call[1]?.method === 'POST')!;
    expect(JSON.parse(String(createCall[1]?.body))).toEqual({ code: '2028-2029', name: 'Năm học mới' });
    await userEvent.click(screen.getByRole('button', { name: 'Sửa 2026-2027' }));
    await userEvent.clear(screen.getByLabelText('Mã năm học')); await userEvent.type(screen.getByLabelText('Mã năm học'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu năm học' }));
    expect(screen.getByRole('heading', { name: 'Chỉnh sửa năm học' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/academic-years/year-1') && call[1]?.method === 'PATCH')).toBe(false);
    await userEvent.clear(screen.getByLabelText('Mã năm học')); await userEvent.type(screen.getByLabelText('Mã năm học'), ' 2027-2028 ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu năm học' }));
    const patchCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/academic-years/year-1') && call[1]?.method === 'PATCH')!;
    expect(JSON.parse(String(patchCall[1]?.body))).toEqual({ code: '2027-2028' });
    await userEvent.click(screen.getByRole('button', { name: 'Sửa 2026-2027' })); await userEvent.click(screen.getByRole('button', { name: 'Lưu năm học' }));
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/academic-years/year-1') && call[1]?.method === 'PATCH')).toHaveLength(1);
  }, 10_000);

  it('clears stale AcademicYear mutation feedback when an explicit new workflow begins', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); if (url.endsWith('/auth/me')) return jsonResponse(academicAuth);
      if (url.endsWith('/academic-years') && init?.method === 'POST' && attempts++ === 0) return jsonResponse({ statusCode: 409, message: 'conflict' }, 409);
      return jsonResponse({ items: [year], page: 1, pageSize: 20, total: 1 });
    }));
    renderApp('/quan-tri/cau-truc-nam-hoc'); await screen.findByRole('region', { name: 'Sổ năm học' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo năm học' })); await userEvent.type(screen.getByLabelText('Mã năm học'), '2028'); await userEvent.type(screen.getByLabelText('Tên năm học'), 'Năm học 2028'); await userEvent.click(screen.getByRole('button', { name: 'Lưu năm học' }));
    expect(await screen.findByText(/Dữ liệu xung đột/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' })); await userEvent.click(screen.getByRole('button', { name: 'Tạo năm học' }));
    expect(screen.queryByText(/Dữ liệu xung đột/)).not.toBeInTheDocument();
  }, 10_000);

  it('validates normalized SchoolClass values, preserves empty edits, and sends exact create/update payloads', async () => {
    const row = { id: 'class-1', academicYearId: year.id, code: '10A1', name: 'Lớp 10A1', gradeLevel: 10, status: 'ACTIVE', createdAt: '', updatedAt: '' };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/me')) return jsonResponse(academicAuth); if (url.endsWith('/academic-years/year-1')) return jsonResponse(year);
      if (url.endsWith('/academic-years/year-1/classes') && method === 'POST') return jsonResponse({ ...row, id: 'class-2', code: '10A2' }, 201);
      if (url.endsWith('/school-classes/class-1') && method === 'PATCH') return jsonResponse({ ...row, name: 'Lớp 10A1 mới' });
      return jsonResponse({ items: [row], page: 1, pageSize: 20, total: 1 });
    });
    vi.stubGlobal('fetch', fetchMock); renderApp('/quan-tri/cau-truc-nam-hoc/year-1/lop'); await screen.findByRole('region', { name: 'Sổ lớp học' });
    await userEvent.click(screen.getByRole('button', { name: 'Tạo lớp' })); await userEvent.type(screen.getByLabelText('Mã lớp'), ' '); await userEvent.type(screen.getByLabelText('Tên lớp'), ' '); await userEvent.click(screen.getByRole('button', { name: 'Lưu lớp học' }));
    expect(screen.getByLabelText('Mã lớp')).toHaveAttribute('aria-invalid', 'true'); expect(screen.getByLabelText('Tên lớp')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/academic-years/year-1/classes') && call[1]?.method === 'POST')).toBe(false);
    await userEvent.clear(screen.getByLabelText('Mã lớp')); await userEvent.type(screen.getByLabelText('Mã lớp'), ' 10a2 '); await userEvent.clear(screen.getByLabelText('Tên lớp')); await userEvent.type(screen.getByLabelText('Tên lớp'), ' Lớp 10A2 '); await userEvent.click(screen.getByRole('button', { name: 'Lưu lớp học' }));
    const createCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/academic-years/year-1/classes') && call[1]?.method === 'POST')!;
    expect(JSON.parse(String(createCall[1]?.body))).toEqual({ code: '10A2', name: 'Lớp 10A2', gradeLevel: 10 });
    await userEvent.click(screen.getByRole('button', { name: 'Sửa 10A1' })); await userEvent.clear(screen.getByLabelText('Tên lớp')); await userEvent.type(screen.getByLabelText('Tên lớp'), ' '); await userEvent.click(screen.getByRole('button', { name: 'Lưu lớp học' }));
    expect(screen.getByRole('heading', { name: 'Chỉnh sửa lớp học' })).toBeInTheDocument(); expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/school-classes/class-1') && call[1]?.method === 'PATCH')).toBe(false);
    await userEvent.clear(screen.getByLabelText('Tên lớp')); await userEvent.type(screen.getByLabelText('Tên lớp'), ' Lớp 10A1 mới '); await userEvent.click(screen.getByRole('button', { name: 'Lưu lớp học' }));
    const patchCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/school-classes/class-1') && call[1]?.method === 'PATCH')!;
    expect(JSON.parse(String(patchCall[1]?.body))).toEqual({ name: 'Lớp 10A1 mới' });
    await userEvent.click(screen.getByRole('button', { name: 'Sửa 10A1' })); await userEvent.click(screen.getByRole('button', { name: 'Lưu lớp học' }));
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/school-classes/class-1') && call[1]?.method === 'PATCH')).toHaveLength(1);
  }, 10_000);

  it('sends exact SchoolClass status and grade filters', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => { const url = String(input); if (url.endsWith('/auth/me')) return jsonResponse(academicAuth); if (url.endsWith('/academic-years/year-1')) return jsonResponse(year); return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }); });
    vi.stubGlobal('fetch', fetchMock); renderApp('/quan-tri/cau-truc-nam-hoc/year-1/lop'); await screen.findByRole('heading', { name: 'Chưa có lớp học' });
    await userEvent.selectOptions(screen.getByLabelText('Trạng thái'), 'INACTIVE');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('status=INACTIVE'))).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText('Khối', { selector: '#class-grade-filter' }), '11');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('status=INACTIVE') && String(call[0]).includes('gradeLevel=11'))).toBe(true);
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

  it('keeps active calendar actions hidden and renders each official or reserve week with its own segments', async () => {
    const activeSummary = { ...versionSummary, isActive: true, officialWeekCount: 5, reserveWeekCount: 1 };
    const detail = {
      ...versionDetail,
      ...activeSummary,
      weeks: [
        { id: 'week-5', kind: 'OFFICIAL', officialWeekNumber: 5, reserveWeekNumber: null, displayLabel: 'Tuần 5', sortOrder: 1, segments: [{ id: 'segment-5a', label: '5a', segmentOrder: 1, startDate: '2026-08-31', endDate: '2026-09-01', createdAt: '', updatedAt: '' }, { id: 'segment-5b', label: '5b', segmentOrder: 2, startDate: '2026-09-02', endDate: '2026-09-04', createdAt: '', updatedAt: '' }], createdAt: '', updatedAt: '' },
        { id: 'week-dp1', kind: 'RESERVE', officialWeekNumber: null, reserveWeekNumber: 1, displayLabel: 'DP1', sortOrder: 2, segments: [{ id: 'segment-dp1', label: 'Dự phòng', segmentOrder: 1, startDate: '2026-09-04', endDate: '2026-09-04', createdAt: '', updatedAt: '' }], createdAt: '', updatedAt: '' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => { const url = String(input); if (url.endsWith('/auth/me')) return jsonResponse(academicAuth); if (url.endsWith('/academic-years/year-1')) return jsonResponse(year); if (url.endsWith('/academic-calendar-versions/version-1')) return jsonResponse(detail); return jsonResponse({ items: [activeSummary], page: 1, pageSize: 20, total: 1 }); }));
    renderApp('/quan-tri/cau-truc-nam-hoc/year-1/lich');
    expect(await screen.findByText('Đang áp dụng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kích hoạt Phiên 1' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Xem chi tiết Phiên 1' }));
    const officialWeek = await screen.findByRole('heading', { name: 'Tuần 5 · thứ tự 1' });
    expect(within(officialWeek.closest('section')!).getByText('5a')).toBeInTheDocument();
    expect(within(officialWeek.closest('section')!).getByText('5b')).toBeInTheDocument();
    expect(screen.getByText('Tuần dự phòng 1')).toBeInTheDocument();
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
  }, 10_000);

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
  }, 10_000);

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
