import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeroomAssignmentsPage } from '../pages/HomeroomAssignmentsPage';
import { jsonResponse, renderWithQuery } from './test-utils';

const year = { id: 'year-1', code: '2026-2027', name: 'Năm học 2026–2027' };
const activeClass = { id: 'class-1', code: '10A1', name: '10A1', gradeLevel: 10, status: 'ACTIVE' as const };
const inactiveClass = { id: 'class-2', code: '10A2', name: '10A2', gradeLevel: 10, status: 'INACTIVE' as const };
const teacher = { userId: 'teacher-1', username: 'old-teacher', displayName: 'Giáo viên cũ', staffCode: null, userStatus: 'DISABLED' as const, isTeachingStaff: false };
const currentTeacher = { userId: 'teacher-2', username: 'current-teacher', displayName: 'Giáo viên hiện tại', staffCode: 'GV02', userStatus: 'ACTIVE' as const, isTeachingStaff: true };
const profilelessTeacher = { userId: 'teacher-3', username: 'profileless', displayName: 'Danh tính không hồ sơ', staffCode: null, userStatus: 'DISABLED' as const, isTeachingStaff: null };
const years = [year, { id: 'year-2', code: '2025-2026', name: 'Năm học cũ' }];

function workspace(activeCalendar = false) {
  return { businessDate: '2026-09-04', academicYear: year, activeCalendar: activeCalendar ? { id: 'calendar-1', versionNumber: 1, startDate: '2026-08-31', endDate: '2027-05-31' } : null, classes: [activeClass, inactiveClass], historicalTeachers: [teacher] };
}
const activeCalendar = { id: 'calendar-1', versionNumber: 1, startDate: '2026-08-31', endDate: '2027-05-31' };
type CalendarFixture = typeof activeCalendar;
const activeRow = { id: 'row-1', academicYearId: 'year-1', schoolClassId: 'class-1', teacherUserId: 'teacher-2', validFrom: '2026-08-31', validUntil: '2026-09-10', status: 'ACTIVE' as const, note: 'Ghi chú', entryReason: null, replacesId: null, createdByUserId: 'actor-1', reversedByUserId: null, reversedAt: null, reversalReason: null, createdAt: '', updatedAt: '', schoolClass: activeClass, teacher: currentTeacher };
const reversedRow = { ...activeRow, id: 'row-2', status: 'REVERSED' as const, reversalReason: 'Sai nguồn', reversedAt: '2026-09-05T10:00:00.000Z', reversedByUserId: 'actor-2', teacher };
function fullWorkspace(calendar: CalendarFixture | null = activeCalendar) { return { ...workspace(Boolean(calendar)), activeCalendar: calendar }; }
function fetchFor(options: { calendar?: typeof activeCalendar | null; rows?: unknown[]; status?: number } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? 'GET';
    if (url.includes('/homeroom-assignment-options/academic-years?')) return jsonResponse({ items: years, page: 1, pageSize: 100, total: years.length });
    if (/homeroom-assignment-options\/academic-years\/[^/?]+$/.test(url)) return jsonResponse(fullWorkspace(options.calendar === undefined ? activeCalendar : options.calendar));
    if (url.includes('/eligible-teachers')) return jsonResponse({ items: [currentTeacher, profilelessTeacher], page: 1, pageSize: 100, total: 2 });
    if (url.includes('/historical-teacher-identities')) return jsonResponse({ items: [teacher, profilelessTeacher, currentTeacher], page: 1, pageSize: 100, total: 3 });
    if (url.includes('/homeroom-assignments') && method === 'GET') return jsonResponse({ items: options.rows ?? [activeRow, reversedRow], page: 1, pageSize: 20, total: (options.rows ?? [activeRow, reversedRow]).length });
    if (method === 'POST') return options.status ? jsonResponse({ statusCode: options.status }, options.status) : jsonResponse(activeRow, 201);
    return jsonResponse({});
  });
}

describe('Homeroom administration workspace', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('renders a loading state before academic years resolve', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    renderWithQuery(<HomeroomAssignmentsPage />);
    expect(screen.getByRole('status', { name: 'Đang tải dữ liệu' })).toBeInTheDocument();
  });

  it('renders the no-year state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 }))));
    renderWithQuery(<HomeroomAssignmentsPage />);
    expect(await screen.findByRole('heading', { name: 'Chưa có năm học' })).toBeInTheDocument();
  });

  it('keeps retained history readable without an active calendar and does not fetch candidates', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/academic-years?')) return jsonResponse({ items: [year], page: 1, pageSize: 100, total: 1 });
      if (url.endsWith('/year-1')) return jsonResponse(workspace());
      if (url.includes('/homeroom-assignments')) return jsonResponse({ items: [{ id: 'row-1', academicYearId: 'year-1', schoolClassId: 'class-1', teacherUserId: 'teacher-1', validFrom: '2026-08-31', validUntil: null, status: 'ACTIVE', note: null, entryReason: null, replacesId: null, createdByUserId: 'actor-1', reversedByUserId: null, reversedAt: null, reversalReason: null, createdAt: '', updatedAt: '', schoolClass: activeClass, teacher }], page: 1, pageSize: 20, total: 1 });
      return jsonResponse({ items: [], page: 1, pageSize: 100, total: 0 });
    });
    vi.stubGlobal('fetch', fetchMock); renderWithQuery(<HomeroomAssignmentsPage />);
    expect(await screen.findByText('Giáo viên cũ')).toBeInTheDocument();
    expect(screen.getByText(/chưa có phiên lịch/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kết thúc' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => /eligible-teachers|historical-teacher-identities/.test(String(url)))).toBe(false);
  });

  it('renders retained ACTIVE and REVERSED evidence with diagnostic current state', async () => {
    vi.stubGlobal('fetch', fetchFor()); renderWithQuery(<HomeroomAssignmentsPage />);
    expect(await screen.findByText('Đã đảo / hiệu chỉnh')).toBeInTheDocument();
    expect(screen.getAllByText(/trạng thái hiện tại.*chỉ chẩn đoán/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/sai nguồn/i)).toBeInTheDocument();
    expect(screen.getByText(/người đảo: actor-2/i)).toBeInTheDocument();
  });

  it('serializes filters and pagination to retained history', async () => {
    const fetchMock = fetchFor(); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />);
    await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' });
    await user.selectOptions(screen.getByLabelText('Lớp'), 'class-1'); await user.selectOptions(screen.getByLabelText('Giáo viên trong lịch sử'), 'teacher-1');
    fireEvent.change(screen.getByLabelText('Hiệu lực tại'), { target: { value: '2026-09-04' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('schoolClassId=class-1') && String(url).includes('teacherUserId=teacher-1') && String(url).includes('activeOn=2026-09-04'))).toBe(true));
  });

  it('offers only ACTIVE classes and eligible teachers for current create', async () => {
    const fetchMock = fetchFor({ rows: [] }); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />);
    await user.click(await screen.findByRole('button', { name: 'Tạo phân công' })); const form = screen.getByRole('heading', { name: 'Tạo phân công chủ nhiệm' }).closest('form')!;
    expect(within(form).getByLabelText('Lớp').querySelector('option[value="class-2"]')).toBeNull();
    await user.selectOptions(within(form).getByLabelText('Lớp'), 'class-1'); fireEvent.change(within(form).getByLabelText('Có hiệu lực từ'), { target: { value: '2026-09-04' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/eligible-teachers') && String(url).includes('validFrom=2026-09-04'))).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('historical-teacher-identities'))).toBe(false);
  });

  it('uses retained classes and trimmed historical identity search for historical create', async () => {
    const fetchMock = fetchFor({ rows: [] }); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />);
    await user.click(await screen.findByRole('button', { name: 'Tạo phân công' })); const form = screen.getByRole('heading', { name: 'Tạo phân công chủ nhiệm' }).closest('form')!;
    fireEvent.change(within(form).getByLabelText('Có hiệu lực từ'), { target: { value: '2026-08-31' } }); fireEvent.change(within(form).getByLabelText('Có hiệu lực đến'), { target: { value: '2026-09-03' } });
    expect(within(form).getByLabelText('Lớp').querySelector('option[value="class-2"]')).not.toBeNull();
    await user.type(within(form).getByLabelText('Tìm danh tính giáo viên lịch sử'), ' A'); expect(fetchMock.mock.calls.some(([url]) => String(url).includes('historical-teacher-identities'))).toBe(false);
    await user.type(within(form).getByLabelText('Tìm danh tính giáo viên lịch sử'), 'n ');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('historical-teacher-identities?q=An'))).toBe(true));
    expect(within(form).getByLabelText('Giáo viên theo danh tính lịch sử').querySelector('option[value="teacher-3"]')).not.toBeNull();
  });

  it('clears stale historical teacher and inactive class when classification becomes current', async () => {
    vi.stubGlobal('fetch', fetchFor({ rows: [] })); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />);
    await user.click(await screen.findByRole('button', { name: 'Tạo phân công' })); const form = screen.getByRole('heading', { name: 'Tạo phân công chủ nhiệm' }).closest('form')!;
    fireEvent.change(within(form).getByLabelText('Có hiệu lực từ'), { target: { value: '2026-08-31' } }); fireEvent.change(within(form).getByLabelText('Có hiệu lực đến'), { target: { value: '2026-09-03' } }); await user.selectOptions(within(form).getByLabelText('Lớp'), 'class-2');
    fireEvent.change(within(form).getByLabelText('Có hiệu lực đến'), { target: { value: '2026-09-04' } });
    await waitFor(() => expect(within(form).getByLabelText('Lớp')).toHaveValue(''));
  });

  it('uses exact END command and rejects an invalid date locally', async () => {
    const fetchMock = fetchFor({ rows: [activeRow] }); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />);
    const table = await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' }); await user.click(within(table).getByRole('button', { name: 'Kết thúc' }));
    fireEvent.change(screen.getByLabelText('Ngày kết thúc'), { target: { value: '2026-09-11' } }); await user.click(screen.getByRole('button', { name: 'Xác nhận kết thúc' })); expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/row-1/end'))).toBe(false);
    fireEvent.change(screen.getByLabelText('Ngày kết thúc'), { target: { value: '2026-09-05' } }); await user.click(screen.getByRole('button', { name: 'Xác nhận kết thúc' })); await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/homeroom-assignments/row-1/end', expect.objectContaining({ body: JSON.stringify({ endDate: '2026-09-05' }) })));
  });

  it('derives bounded change candidates from source end and excludes current teacher', async () => {
    const fetchMock = fetchFor({ rows: [activeRow] }); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />);
    const table = await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' }); await user.click(within(table).getByRole('button', { name: 'Đổi giáo viên' }));
    expect(screen.queryByLabelText('Có hiệu lực đến')).not.toBeInTheDocument(); fireEvent.change(screen.getByLabelText('Có hiệu lực từ'), { target: { value: '2026-09-05' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('validFrom=2026-09-05') && String(url).includes('validUntil=2026-09-10'))).toBe(true));
    const select = screen.getByLabelText('Giáo viên đủ điều kiện'); expect(select.querySelector('option[value="teacher-2"]')).toBeNull();
  });

  it('shows historical change search and requires its entry reason', async () => {
    const historical = { ...activeRow, validUntil: '2026-09-03' }; const fetchMock = fetchFor({ rows: [historical] }); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />);
    await user.click(within(await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' })).getByRole('button', { name: 'Đổi giáo viên' })); fireEvent.change(screen.getByLabelText('Có hiệu lực từ'), { target: { value: '2026-09-01' } });
    await user.type(screen.getByLabelText('Tìm danh tính giáo viên lịch sử'), 'An'); await waitFor(() => expect(screen.getByLabelText('Giáo viên theo danh tính lịch sử')).toBeEnabled()); await user.selectOptions(screen.getByLabelText('Giáo viên theo danh tính lịch sử'), 'teacher-1'); await user.click(screen.getByRole('button', { name: 'Xác nhận đổi giáo viên' }));
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/change-teacher') && init?.method === 'POST')).toBe(false); expect(screen.getAllByText(/nguồn hoặc lý do nhập/i).length).toBeGreaterThan(1); await user.type(screen.getByLabelText('Nguồn hoặc lý do nhập lịch sử'), 'Bàn giao lưu trữ'); await user.click(screen.getByRole('button', { name: 'Xác nhận đổi giáo viên' }));
    await waitFor(() => { const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/row-1/change-teacher') && init?.method === 'POST'); expect(JSON.parse(String(call?.[1]?.body))).toEqual({ newTeacherUserId: 'teacher-1', effectiveFrom: '2026-09-01', entryReason: 'Bàn giao lưu trữ' }); });
  });

  it('has no generic Edit or Delete action', async () => {
    vi.stubGlobal('fetch', fetchFor()); renderWithQuery(<HomeroomAssignmentsPage />); const table = await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' });
    expect(within(table).queryByRole('button', { name: /edit|sửa|delete|xóa/i })).not.toBeInTheDocument();
  });

  it('preserves the create draft when a deterministic 409 occurs', async () => {
    vi.stubGlobal('fetch', fetchFor({ rows: [], status: 409 })); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />); await user.click(await screen.findByRole('button', { name: 'Tạo phân công' }));
    const form = screen.getByRole('heading', { name: 'Tạo phân công chủ nhiệm' }).closest('form')!; await user.selectOptions(within(form).getByLabelText('Lớp'), 'class-1'); fireEvent.change(within(form).getByLabelText('Có hiệu lực từ'), { target: { value: '2026-09-04' } });
    await waitFor(() => expect(within(form).getByLabelText('Giáo viên đủ điều kiện')).toBeEnabled()); await user.selectOptions(within(form).getByLabelText('Giáo viên đủ điều kiện'), 'teacher-2'); await user.click(within(form).getByRole('button', { name: 'Lưu phân công' }));
    expect(await screen.findByText(/dữ liệu xung đột/i)).toBeInTheDocument(); expect(within(form).getByLabelText('Lớp')).toHaveValue('class-1');
  });

  it('opens correction with multiple replacements and no silent delete', async () => {
    vi.stubGlobal('fetch', fetchFor({ rows: [activeRow] })); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />); const table = await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' });
    await user.click(within(table).getByRole('button', { name: 'Hiệu chỉnh' })); expect(screen.getByRole('heading', { name: 'Hiệu chỉnh phân công chủ nhiệm' })).toBeInTheDocument(); await user.click(screen.getByRole('button', { name: 'Thêm khoảng' }));
    expect(screen.getByLabelText('Bản ghi thay thế đang chỉnh').querySelectorAll('option')).toHaveLength(2);
  });

  it('requires a correction reason before command submission', async () => {
    const fetchMock = fetchFor({ rows: [activeRow] }); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />); await user.click(within(await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' })).getByRole('button', { name: 'Hiệu chỉnh' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận hiệu chỉnh' })); expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/correct') && init?.method === 'POST')).toBe(false);
  });

  it('blocks historical create without entry reason, then sends the exact retained DTO', async () => {
    const fetchMock = fetchFor({ rows: [] }); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />); await user.click(await screen.findByRole('button', { name: 'Tạo phân công' })); const form = screen.getByRole('heading', { name: 'Tạo phân công chủ nhiệm' }).closest('form')!;
    fireEvent.change(within(form).getByLabelText('Có hiệu lực từ'), { target: { value: '2026-08-31' } }); fireEvent.change(within(form).getByLabelText('Có hiệu lực đến'), { target: { value: '2026-09-03' } }); await user.selectOptions(within(form).getByLabelText('Lớp'), 'class-2'); await user.type(within(form).getByLabelText('Tìm danh tính giáo viên lịch sử'), 'An'); await waitFor(() => expect(within(form).getByLabelText('Giáo viên theo danh tính lịch sử')).toBeEnabled()); await user.selectOptions(within(form).getByLabelText('Giáo viên theo danh tính lịch sử'), 'teacher-1'); await user.click(within(form).getByRole('button', { name: 'Lưu phân công' }));
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/homeroom-assignments') && init?.method === 'POST')).toBe(false); expect(screen.getAllByText(/nguồn hoặc lý do nhập/i).length).toBeGreaterThan(1);
    await user.type(within(form).getByLabelText('Nguồn hoặc lý do nhập lịch sử'), 'Sổ lưu trữ'); await user.click(within(form).getByRole('button', { name: 'Lưu phân công' }));
    await waitFor(() => { const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/academic-years/year-1/homeroom-assignments') && init?.method === 'POST'); expect(JSON.parse(String(call?.[1]?.body))).toEqual({ schoolClassId: 'class-2', teacherUserId: 'teacher-1', validFrom: '2026-08-31', validUntil: '2026-09-03', entryReason: 'Sổ lưu trữ' }); });
  });

  it('resets filters and workflow when changing academic year', async () => {
    const fetchMock = fetchFor(); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />); await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' }); await user.selectOptions(screen.getByLabelText('Lớp'), 'class-1'); await user.selectOptions(screen.getByLabelText('Giáo viên trong lịch sử'), 'teacher-1'); fireEvent.change(screen.getByLabelText('Hiệu lực tại'), { target: { value: '2026-09-04' } }); await user.click(screen.getByRole('button', { name: 'Tạo phân công' })); await user.click(screen.getByRole('button', { name: 'Lưu phân công' })); expect(screen.getByRole('alert')).toBeInTheDocument(); await user.selectOptions(screen.getByLabelText('Năm học'), 'year-2');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/academic-years/year-2/homeroom-assignments?page=1&pageSize=20'))).toBe(true)); expect(screen.queryByRole('heading', { name: 'Tạo phân công chủ nhiệm' })).not.toBeInTheDocument(); expect(screen.getByLabelText('Lớp')).toHaveValue(''); expect(screen.getByLabelText('Giáo viên trong lịch sử')).toHaveValue(''); expect(screen.getByLabelText('Hiệu lực tại')).toHaveValue(''); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not allow a 51st correction replacement', async () => {
    vi.stubGlobal('fetch', fetchFor({ rows: [activeRow] })); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />); await user.click(within(await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' })).getByRole('button', { name: 'Hiệu chỉnh' })); const add = screen.getByRole('button', { name: 'Thêm khoảng' }); for (let index = 1; index < 50; index += 1) await user.click(add); expect(add).toBeDisabled(); expect(screen.getByLabelText('Bản ghi thay thế đang chỉnh').querySelectorAll('option')).toHaveLength(50);
  });

  it('resolves correction candidate authority independently per replacement', async () => {
    const fetchMock = fetchFor({ rows: [activeRow] }); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />); await user.click(within(await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' })).getByRole('button', { name: 'Hiệu chỉnh' }));
    await waitFor(() => expect(screen.getByLabelText('Giáo viên đủ điều kiện')).toBeEnabled()); await user.selectOptions(screen.getByLabelText('Giáo viên đủ điều kiện'), 'teacher-3'); await user.click(screen.getByRole('button', { name: 'Thêm khoảng' })); await user.selectOptions(screen.getByLabelText('Bản ghi thay thế đang chỉnh'), '1'); fireEvent.change(screen.getByLabelText('Có hiệu lực đến'), { target: { value: '2026-09-03' } });
    expect(screen.getByLabelText('Tìm danh tính giáo viên lịch sử')).toBeInTheDocument(); await user.type(screen.getByLabelText('Tìm danh tính giáo viên lịch sử'), 'An'); await waitFor(() => expect(screen.getByLabelText('Giáo viên theo danh tính lịch sử')).toBeEnabled()); expect(screen.getByLabelText('Giáo viên theo danh tính lịch sử')).toHaveValue(''); await user.selectOptions(screen.getByLabelText('Giáo viên theo danh tính lịch sử'), 'teacher-1'); await user.selectOptions(screen.getByLabelText('Bản ghi thay thế đang chỉnh'), '0'); expect(screen.getByLabelText('Giáo viên đủ điều kiện')).toHaveValue('teacher-3'); await user.selectOptions(screen.getByLabelText('Bản ghi thay thế đang chỉnh'), '1'); expect(screen.getByLabelText('Giáo viên theo danh tính lịch sử')).toHaveValue('teacher-1');
  });

  it('rejects overlapping correction replacements but allows a gap', async () => {
    const fetchMock = fetchFor({ rows: [activeRow] }); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />); await user.click(within(await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' })).getByRole('button', { name: 'Hiệu chỉnh' })); await user.type(screen.getByLabelText('Lý do hiệu chỉnh'), 'Sửa nguồn'); await waitFor(() => expect(screen.getByLabelText('Giáo viên đủ điều kiện')).toBeEnabled()); await user.selectOptions(screen.getByLabelText('Giáo viên đủ điều kiện'), 'teacher-3'); await user.click(screen.getByRole('button', { name: 'Thêm khoảng' })); await user.selectOptions(screen.getByLabelText('Bản ghi thay thế đang chỉnh'), '1'); fireEvent.change(screen.getByLabelText('Có hiệu lực từ'), { target: { value: '2026-09-05' } }); fireEvent.change(screen.getByLabelText('Có hiệu lực đến'), { target: { value: '2026-09-09' } }); await waitFor(() => expect(screen.getByLabelText('Giáo viên đủ điều kiện')).toBeEnabled()); await user.selectOptions(screen.getByLabelText('Giáo viên đủ điều kiện'), 'teacher-3'); await user.click(screen.getByRole('button', { name: 'Xác nhận hiệu chỉnh' }));
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/correct') && init?.method === 'POST')).toBe(false); expect(screen.getByText(/không được chồng lấn/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Bản ghi thay thế đang chỉnh'), '0'); fireEvent.change(screen.getByLabelText('Có hiệu lực đến'), { target: { value: '2026-09-03' } }); await user.type(screen.getByLabelText('Tìm danh tính giáo viên lịch sử'), 'An'); await waitFor(() => expect(screen.getByLabelText('Giáo viên theo danh tính lịch sử')).toBeEnabled()); await user.selectOptions(screen.getByLabelText('Giáo viên theo danh tính lịch sử'), 'teacher-3'); await user.type(screen.getByLabelText('Nguồn hoặc lý do nhập lịch sử'), 'Sổ cũ'); await user.selectOptions(screen.getByLabelText('Bản ghi thay thế đang chỉnh'), '1'); await user.click(screen.getByRole('button', { name: 'Xác nhận hiệu chỉnh' })); await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/correct') && init?.method === 'POST')).toBe(true));
  });

  it('enforces bounded correction source dates', async () => {
    const boundedFetch = fetchFor({ rows: [activeRow] }); vi.stubGlobal('fetch', boundedFetch); const user = userEvent.setup(); const bounded = renderWithQuery(<HomeroomAssignmentsPage />);
    await user.click(within(await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' })).getByRole('button', { name: 'Hiệu chỉnh' })); await user.type(screen.getByLabelText('Lý do hiệu chỉnh'), 'Sửa nguồn'); await waitFor(() => expect(screen.getByLabelText('Giáo viên đủ điều kiện')).toBeEnabled()); await user.selectOptions(screen.getByLabelText('Giáo viên đủ điều kiện'), 'teacher-3');
    fireEvent.change(screen.getByLabelText('Có hiệu lực đến'), { target: { value: '' } }); await user.click(screen.getByRole('button', { name: 'Xác nhận hiệu chỉnh' })); expect(boundedFetch.mock.calls.some(([url, init]) => String(url).endsWith('/correct') && init?.method === 'POST')).toBe(false);
    fireEvent.change(screen.getByLabelText('Có hiệu lực đến'), { target: { value: '2026-09-11' } }); await user.click(screen.getByRole('button', { name: 'Xác nhận hiệu chỉnh' })); expect(boundedFetch.mock.calls.some(([url, init]) => String(url).endsWith('/correct') && init?.method === 'POST')).toBe(false); bounded.unmount();
  });

  it('allows an open-ended correction replacement for an open-ended source', async () => {
    const openSource = { ...activeRow, validUntil: null }; const fetchMock = fetchFor({ rows: [openSource] }); vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />);
    await user.click(within(await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' })).getByRole('button', { name: 'Hiệu chỉnh' })); await user.type(screen.getByLabelText('Lý do hiệu chỉnh'), 'Hiệu chỉnh mở'); await waitFor(() => expect(screen.getByLabelText('Giáo viên đủ điều kiện')).toBeEnabled()); await user.selectOptions(screen.getByLabelText('Giáo viên đủ điều kiện'), 'teacher-3');
    expect(screen.getByLabelText('Có hiệu lực đến')).toHaveValue(''); await user.click(screen.getByRole('button', { name: 'Xác nhận hiệu chỉnh' }));
    await waitFor(() => { const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/correct') && init?.method === 'POST'); expect(JSON.parse(String(call?.[1]?.body)).replacements[0]).toMatchObject({ teacherUserId: 'teacher-3', validFrom: '2026-08-31' }); expect(JSON.parse(String(call?.[1]?.body)).replacements[0]).not.toHaveProperty('validUntil'); });
  });

  it('refetches retained correction lineage and only Homeroom data after success', async () => {
    let corrected = false; let historyGets = 0; const base = fetchFor({ rows: [activeRow] }); const replacement = { ...activeRow, id: 'row-replacement', teacherUserId: 'teacher-3', teacher: profilelessTeacher, validFrom: '2026-08-31', validUntil: '2026-09-10' }; const reversed = { ...activeRow, status: 'REVERSED' as const, reversalReason: 'Nguồn sai', reversedByUserId: 'actor-9', reversedAt: '2026-09-05T10:00:00.000Z' };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (url.includes('/homeroom-assignments') && (init?.method ?? 'GET') === 'GET') { historyGets += 1; return jsonResponse({ items: corrected ? [reversed, replacement] : [activeRow], page: 1, pageSize: 20, total: corrected ? 2 : 1 }); } if (url.endsWith('/correct') && init?.method === 'POST') { corrected = true; return jsonResponse(replacement, 201); } return base(input, init); });
    vi.stubGlobal('fetch', fetchMock); const user = userEvent.setup(); renderWithQuery(<HomeroomAssignmentsPage />); await user.click(within(await screen.findByRole('region', { name: 'Sổ phân công chủ nhiệm' })).getByRole('button', { name: 'Hiệu chỉnh' })); await user.type(screen.getByLabelText('Lý do hiệu chỉnh'), 'Nguồn sai'); await waitFor(() => expect(screen.getByLabelText('Giáo viên đủ điều kiện')).toBeEnabled()); await user.selectOptions(screen.getByLabelText('Giáo viên đủ điều kiện'), 'teacher-3'); await user.click(screen.getByRole('button', { name: 'Xác nhận hiệu chỉnh' }));
    await waitFor(() => expect(historyGets).toBeGreaterThanOrEqual(2)); expect(await screen.findByText('Danh tính không hồ sơ')).toBeInTheDocument(); expect(screen.getByText(/nguồn sai/i)).toBeInTheDocument(); expect(fetchMock.mock.calls.some(([url]) => /\/api\/(users|subjects|capabilities|duties)/.test(String(url)))).toBe(false);
  });
});
