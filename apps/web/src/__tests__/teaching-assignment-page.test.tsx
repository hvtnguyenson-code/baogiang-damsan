import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const subjectAuth = { ...normalAuth, capabilities: [{ key: 'SUBJECT_MANAGE' as const, scope: 'SCHOOL_WIDE' as const }] };
const years = [
  { id: 'year-new', code: '2026-2027', name: 'Năm học mới' },
  { id: 'year-old', code: '2025-2026', name: 'Năm học cũ' },
];
const activeCalendar = { id: 'calendar-1', versionNumber: 1, startDate: '2026-08-31', endDate: '2026-09-04' };
const classes = [
  { id: 'class-active', code: '10A1', name: 'Lớp 10A1', gradeLevel: 10, status: 'ACTIVE' },
  { id: 'class-inactive', code: '10C', name: 'Lớp cũ', gradeLevel: 10, status: 'INACTIVE' },
];
const subjects = [
  { id: 'subject-active', code: 'TOAN', name: 'Toán', status: 'ACTIVE' },
  { id: 'subject-inactive', code: 'LYCU', name: 'Vật lý cũ', status: 'INACTIVE' },
];
const teachers = [
  { userId: 'teacher-a', username: 'gva', displayName: 'Giáo viên A', staffCode: 'GVA', userStatus: 'ACTIVE', isTeachingStaff: true },
  { userId: 'teacher-b', username: 'gvb', displayName: 'Giáo viên B', staffCode: 'GVB', userStatus: 'ACTIVE', isTeachingStaff: true },
];
const row = {
  id: 'assignment-1', academicYearId: 'year-new', schoolClassId: 'class-active', subjectId: 'subject-active', teacherUserId: 'teacher-a',
  validFrom: '2026-08-31', validUntil: null, note: 'Phụ trách chính', createdAt: '', updatedAt: '',
  schoolClass: classes[0], subject: subjects[0], teacher: teachers[0],
};

function page(items: unknown[] = [], size = 20) { return { items, page: 1, pageSize: size, total: items.length }; }
function workspace(calendar: typeof activeCalendar | null = activeCalendar) {
  return { academicYear: years[0], activeCalendar: calendar, classes, subjects, historicalTeachers: teachers };
}

function defaultFetch(options: {
  calendar?: typeof activeCalendar | null;
  assignments?: unknown[];
  candidates?: unknown[];
  mutationStatus?: number;
} = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? 'GET';
    if (url.endsWith('/auth/me')) return jsonResponse(subjectAuth);
    if (url.includes('/teaching-assignment-options/academic-years?')) return jsonResponse(page(years, 100));
    if (url.includes('/eligible-teachers')) return jsonResponse(page(options.candidates ?? teachers, 100));
    if (/\/teaching-assignment-options\/academic-years\/[^/?]+$/.test(url)) return jsonResponse(workspace(options.calendar === undefined ? activeCalendar : options.calendar));
    if (url.includes('/teaching-assignments') && method === 'GET') return jsonResponse(page(options.assignments ?? [row]));
    if (url.includes('/teaching-assignments') && method === 'POST') {
      return options.mutationStatus ? jsonResponse({ statusCode: options.mutationStatus, message: 'conflict' }, options.mutationStatus) : jsonResponse(row, 201);
    }
    return jsonResponse({});
  });
}

describe('TeachingAssignmentsPage', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows stable loading and a real no-year empty state', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/me')) return jsonResponse(subjectAuth);
      return new Promise<Response>(() => undefined);
    }));
    const first = renderApp('/quan-tri/phan-cong-giang-day');
    expect(await screen.findByText('Đang tải dữ liệu')).toBeInTheDocument();
    first.unmount();

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
      ? jsonResponse(subjectAuth) : jsonResponse(page([], 100))));
    renderApp('/quan-tri/phan-cong-giang-day');
    expect(await screen.findByRole('heading', { name: 'Chưa có năm học để xem phân công' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tạo năm học/i })).not.toBeInTheDocument();
  });

  it('selects the newest year first and preserves an explicit selection through refetch', async () => {
    const fetchMock = defaultFetch({ assignments: [] }); vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup(); renderApp('/quan-tri/phan-cong-giang-day');
    const select = await screen.findByLabelText('Năm học');
    expect(select).toHaveValue('year-new');
    await user.selectOptions(select, 'year-old');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/academic-years/year-old'))).toBe(true));
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(select).toHaveValue('year-old'));
  });

  it('keeps history readable without an active calendar and never requests eligible teachers', async () => {
    const fetchMock = defaultFetch({ calendar: null }); vi.stubGlobal('fetch', fetchMock);
    renderApp('/quan-tri/phan-cong-giang-day');
    expect(await screen.findByText('Phụ trách chính')).toBeInTheDocument();
    expect(screen.getByText(/chưa có phiên lịch đang áp dụng/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo phân công' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Kết thúc' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đổi giáo viên' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/eligible-teachers'))).toBe(false);
  });

  it('serializes exact history filters and resets them and an open workflow when year changes', async () => {
    const fetchMock = defaultFetch(); vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup(); renderApp('/quan-tri/phan-cong-giang-day');
    await screen.findByRole('region', { name: 'Sổ phân công giảng dạy' });
    await user.selectOptions(screen.getByLabelText('Lớp', { selector: '#teaching-filter-class' }), 'class-active');
    await user.selectOptions(screen.getByLabelText('Môn học', { selector: '#teaching-filter-subject' }), 'subject-active');
    await user.selectOptions(screen.getByLabelText('Giáo viên', { selector: '#teaching-filter-teacher' }), 'teacher-a');
    fireEvent.change(screen.getByLabelText('Hiệu lực tại'), { target: { value: '2026-09-02' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => {
      const text = String(url);
      return text.includes('schoolClassId=class-active') && text.includes('subjectId=subject-active')
        && text.includes('teacherUserId=teacher-a') && text.includes('activeOn=2026-09-02');
    })).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Tạo phân công' }));
    expect(screen.getByRole('heading', { name: 'Tạo phân công giảng dạy' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Năm học'), 'year-old');
    expect(screen.queryByRole('heading', { name: 'Tạo phân công giảng dạy' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Lớp', { selector: '#teaching-filter-class' })).toHaveValue('');
    expect(screen.getByLabelText('Hiệu lực tại')).toHaveValue('');
  });

  it('uses active create choices and bounds, delays eligibility, clears stale candidates, and sends the exact DTO', async () => {
    const fetchMock = defaultFetch({ assignments: [] }); vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup(); renderApp('/quan-tri/phan-cong-giang-day');
    await user.click(await screen.findByRole('button', { name: 'Tạo phân công' }));
    const form = screen.getByRole('heading', { name: 'Tạo phân công giảng dạy' }).closest('form')!;
    expect(within(form).getByLabelText('Lớp').querySelector('option[value="class-inactive"]')).toBeNull();
    expect(within(form).getByLabelText('Môn học').querySelector('option[value="subject-inactive"]')).toBeNull();
    expect(within(form).getByLabelText('Có hiệu lực từ')).toHaveAttribute('min', activeCalendar.startDate);
    expect(within(form).getByLabelText('Có hiệu lực từ')).toHaveAttribute('max', activeCalendar.endDate);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/eligible-teachers'))).toBe(false);
    await user.selectOptions(within(form).getByLabelText('Lớp'), 'class-active');
    await user.selectOptions(within(form).getByLabelText('Môn học'), 'subject-active');
    fireEvent.change(within(form).getByLabelText('Có hiệu lực từ'), { target: { value: '2026-08-31' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('validFrom=2026-08-31'))).toBe(true));
    await waitFor(() => expect(within(form).getByLabelText('Giáo viên')).toBeEnabled());
    await waitFor(() => expect(within(form).getByLabelText('Giáo viên').querySelector('option[value="teacher-a"]')).not.toBeNull());
    await user.selectOptions(within(form).getByLabelText('Giáo viên'), 'teacher-a');
    fireEvent.change(within(form).getByLabelText('Có hiệu lực đến'), { target: { value: '2026-09-03' } });
    expect(within(form).getByLabelText('Giáo viên')).toHaveValue('');
    fireEvent.change(within(form).getByLabelText('Có hiệu lực đến'), { target: { value: '' } });
    await waitFor(() => expect(within(form).getByLabelText('Giáo viên')).toBeEnabled());
    await user.selectOptions(within(form).getByLabelText('Giáo viên'), 'teacher-a');
    await user.click(within(form).getByRole('button', { name: 'Lưu phân công' }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/academic-years/year-new/teaching-assignments') && init?.method === 'POST');
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        schoolClassId: 'class-active', subjectId: 'subject-active', teacherUserId: 'teacher-a', validFrom: '2026-08-31',
      });
    });
    expect(await screen.findByText('Đã tạo phân công giảng dạy.')).toBeInTheDocument();
  });

  it('treats zero eligible teachers as a factual empty state and preserves a 409 create draft', async () => {
    const fetchMock = defaultFetch({ assignments: [], candidates: [], mutationStatus: 409 }); vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup(); renderApp('/quan-tri/phan-cong-giang-day');
    await user.click(await screen.findByRole('button', { name: 'Tạo phân công' }));
    const form = screen.getByRole('heading', { name: 'Tạo phân công giảng dạy' }).closest('form')!;
    await user.selectOptions(within(form).getByLabelText('Lớp'), 'class-active');
    await user.selectOptions(within(form).getByLabelText('Môn học'), 'subject-active');
    fireEvent.change(within(form).getByLabelText('Có hiệu lực từ'), { target: { value: '2026-08-31' } });
    expect(await within(form).findByText(/không có giáo viên đáp ứng điều kiện/i)).toBeInTheDocument();

    fetchMock.mockImplementation(defaultFetch({ assignments: [], candidates: teachers, mutationStatus: 409 }).getMockImplementation()!);
    fireEvent.change(within(form).getByLabelText('Có hiệu lực từ'), { target: { value: '2026-09-01' } });
    await waitFor(() => expect(within(form).getByLabelText('Giáo viên')).toBeEnabled());
    await user.selectOptions(within(form).getByLabelText('Giáo viên'), 'teacher-a');
    await user.click(within(form).getByRole('button', { name: 'Lưu phân công' }));
    expect(await screen.findByText(/dữ liệu xung đột/i)).toBeInTheDocument();
    expect(within(form).getByLabelText('Có hiệu lực từ')).toHaveValue('2026-09-01');
    expect(within(form).getByLabelText('Giáo viên')).toHaveValue('teacher-a');
  });

  it('requires a bounded explicit END command and offers no generic edit or delete', async () => {
    const bounded = { ...row, validUntil: '2026-09-03' };
    const fetchMock = defaultFetch({ assignments: [bounded] }); vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup(); renderApp('/quan-tri/phan-cong-giang-day');
    const table = await screen.findByRole('region', { name: 'Sổ phân công giảng dạy' });
    expect(within(table).queryByRole('button', { name: /sửa|xóa/i })).not.toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Kết thúc' }));
    const endDate = screen.getByLabelText('Ngày kết thúc');
    expect(endDate).toHaveValue('');
    expect(endDate).toHaveAttribute('min', '2026-08-31');
    expect(endDate).toHaveAttribute('max', '2026-09-03');
    fireEvent.change(endDate, { target: { value: '2026-09-04' } });
    await user.click(screen.getByRole('button', { name: 'Xác nhận kết thúc' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('31/08/2026 đến 03/09/2026');
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/assignment-1/end'))).toBe(false);
    fireEvent.change(endDate, { target: { value: '2026-09-02' } });
    await user.click(screen.getByRole('button', { name: 'Xác nhận kết thúc' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/teaching-assignments/assignment-1/end', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ endDate: '2026-09-02' }),
    })));
  });

  it('uses the next civil day for replacement, inherits bounded end, and excludes the current teacher', async () => {
    const bounded = { ...row, validUntil: '2026-09-04' };
    const fetchMock = defaultFetch({ assignments: [bounded] }); vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup(); renderApp('/quan-tri/phan-cong-giang-day');
    const table = await screen.findByRole('region', { name: 'Sổ phân công giảng dạy' });
    await user.click(within(table).getByRole('button', { name: 'Đổi giáo viên' }));
    const effectiveFrom = screen.getByLabelText('Có hiệu lực từ');
    expect(effectiveFrom).toHaveAttribute('min', '2026-09-01');
    expect(effectiveFrom).toHaveAttribute('max', '2026-09-04');
    fireEvent.change(effectiveFrom, { target: { value: '2026-09-02' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('validFrom=2026-09-02') && String(url).includes('validUntil=2026-09-04'))).toBe(true));
    const teacherSelect = screen.getByLabelText('Giáo viên mới');
    await waitFor(() => expect(teacherSelect).toBeEnabled());
    await waitFor(() => expect(teacherSelect.querySelector('option[value="teacher-b"]')).not.toBeNull());
    expect(teacherSelect.querySelector('option[value="teacher-a"]')).toBeNull();
    await user.selectOptions(teacherSelect, 'teacher-b');
    await user.click(screen.getByRole('button', { name: 'Xác nhận đổi giáo viên' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/teaching-assignments/assignment-1/change-teacher', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ newTeacherUserId: 'teacher-b', effectiveFrom: '2026-09-02' }),
    })));
    expect(await screen.findByText(/phân công trước đó vẫn được giữ trong lịch sử/i)).toBeInTheDocument();
  });

  it('omits validUntil from an open-ended replacement candidate request', async () => {
    const fetchMock = defaultFetch(); vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup(); renderApp('/quan-tri/phan-cong-giang-day');
    const table = await screen.findByRole('region', { name: 'Sổ phân công giảng dạy' });
    await user.click(within(table).getByRole('button', { name: 'Đổi giáo viên' }));
    fireEvent.change(screen.getByLabelText('Có hiệu lực từ'), { target: { value: '2026-09-02' } });
    await waitFor(() => {
      const candidateUrl = fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.includes('/eligible-teachers') && url.includes('validFrom=2026-09-02'));
      expect(candidateUrl).toBeTruthy();
      expect(candidateUrl).not.toContain('validUntil');
    });
  });
});
