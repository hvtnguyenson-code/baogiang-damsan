import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const route = '/quan-tri/dieu-hanh-chuyen-mon';
const calendarAuth = { ...normalAuth, capabilities: [{ key: 'CALENDAR_EXCEPTION_MANAGE' as const, scope: 'SCHOOL_WIDE' as const }] };
const allowed = {
  ...normalAuth,
  capabilities: [{ key: 'TEACHING_OPERATION_MANAGE' as const, scope: 'SUBJECT' as const, resourceId: 'subject-1' }],
};

function fetchMock(auth: unknown = allowed, status: 'PASS' | 'BLOCKED' = 'PASS', blockedPreview = false) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return jsonResponse(auth);
    if (url.endsWith('/operational-overlays/workspace/context')) return jsonResponse({
      years: [{ id: 'year-1', code: '2026-2027', name: 'Năm học 2026-2027' }],
      subjects: [{ id: 'subject-1', code: 'TOAN', name: 'Toán' }],
      permissions: { calendarSchoolWide: auth === calendarAuth, teachingSchoolWide: false, teachingSubjectIds: ['subject-1'] },
    });
    if (url.includes('/operational-overlays/workspace/source-occurrences?')) {
      if (status === 'BLOCKED') return jsonResponse({ status, items: [], reason: 'Nguồn không đủ điều kiện.', coverage: { ppctItemAllocation: 'NOT_ASSESSED' } });
      return jsonResponse({
        status, coverage: { ppctItemAllocation: 'NOT_ASSESSED' },
        items: [{
          occurrenceKey: 'NORMAL:entry-1:2026-10-22', academicCalendarVersionId: 'calendar-1', timetableEntryId: 'entry-1', civilDate: '2026-10-22',
          schoolClassId: 'class-1', schoolClassName: '10A1', subjectId: 'subject-1', subjectName: 'Toán',
          gradeLevel: 10, responsibleTeacherUserId: 'teacher-1', responsibleTeacherName: 'Nguyễn Thị A',
          slot: { id: 'slot-1', weekday: 'THURSDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
          effectiveKind: 'BASE_TIMETABLE', selectable: true,
        }],
      });
    }

    if (url.includes('/operational-overlays/workspace/teacher-options?')) {
      return jsonResponse({ status: 'OPTIONS_NOT_COLLISION_CHECKED',
        items: [{ userId: 'teacher-2', name: 'Giáo viên B' }] });
    }
    if (url.endsWith('/operational-overlays/workspace/disposition-preview') && init?.method === 'POST') {
      if (blockedPreview) return jsonResponse({ status: 'BLOCKED', reason: 'Giáo viên đã có lịch trùng.', coverage: { ppctItemAllocation: 'NOT_ASSESSED', workload: 'NOT_ASSESSED', debt: 'NOT_ASSESSED' } });
      return jsonResponse({
        status: 'PASS', sourceTimetableEntryId: 'entry-1', candidateTeacherUserId: 'teacher-2',
        eligibilitySameSubject: true,
        coverage: { ppctItemAllocation: 'NOT_ASSESSED', workload: 'NOT_ASSESSED', debt: 'NOT_ASSESSED' },
      });
    }
    if (url.endsWith('/operational-overlays/workspace/calendar-preview') && init?.method === 'POST') {
      return jsonResponse({
        status: 'PASS', affected: [{
          occurrenceKey: 'NORMAL:entry-1:2026-10-22', timetableEntryId: 'entry-1',
          schoolClassId: 'class-1', subjectId: 'subject-1', teacherUserId: 'teacher-1',
          slot: { id: 'slot-1', weekday: 'THURSDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
        }],
        coverage: { ppctItemAllocation: 'NOT_ASSESSED', workload: 'NOT_ASSESSED', debt: 'NOT_ASSESSED' },
      });
    }
    return jsonResponse({});
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('P5-054 source selection workspace', () => {
  it.each([409, 500])('uses assessed backend evidence and one stable request identity on HTTP %s; no automatic retry', async (httpStatus) => {
    const base = fetchMock(calendarAuth);
    const commands: unknown[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/workspace/calendar-preview')) return jsonResponse({
        status: 'PASS', affected: [], consequenceFingerprint: 'a'.repeat(64),
        coverage: { ppctItemAllocation: 'ASSESSED', workload: 'ASSESSED', debt: 'ASSESSED' },
        consequences: {
          teachers: [{ targetUserId: 'teacher-1', teacherName: 'Nguyễn Thị A', status: 'PASS',
            before: { earnedCredit: 1, requiredCredit: 18 }, after: { earnedCredit: 1, requiredCredit: 18 } }],
          streams: [{ scope: { schoolClassId: 'class-1', subjectId: 'subject-1' }, schoolClassName: '10A1', subjectName: 'Toán',
            progress: { before: { counts: { completedCount: 1, openDebtCount: 0, distributedElapsedCount: 2 } },
              after: { counts: { completedCount: 1, openDebtCount: 0, distributedElapsedCount: 1 } } } }],
        },
      });
      if (url.endsWith('/calendar-exceptions') && init?.method === 'POST') {
        commands.push(JSON.parse(String(init.body)));
        return jsonResponse({ message: 'SQL_INTERNAL hidden-uuid' }, httpStatus);
      }
      return base(input, init);
    });
    vi.stubGlobal('fetch', fetcher);
    renderApp(route);
    await screen.findByText('Năm học 2026-2027');
    fireEvent.change(screen.getByLabelText('Ngày dạy'), { target: { value: '2026-10-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tiết dạy gốc' }));
    await screen.findByText('Xem trước ngoại lệ lịch học');
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước số tiết bị ảnh hưởng' }));
    await screen.findByText('Hệ quả đã đối soát');
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận ngoại lệ lịch' }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ expectedConsequenceFingerprint: 'a'.repeat(64), requestKey: expect.any(String), academicYearId: 'year-1' });
    await waitFor(() => expect(screen.queryByText('SQL_INTERNAL hidden-uuid')).toBeNull());
    if (httpStatus === 409) await waitFor(() => expect(screen.queryByRole('button', { name: 'Xác nhận ngoại lệ lịch' })).toBeNull());
    else {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận ngoại lệ lịch' })).not.toBeDisabled());
      fireEvent.click(screen.getByRole('button', { name: 'Xác nhận ngoại lệ lịch' }));
      await waitFor(() => expect(commands).toHaveLength(2));
      expect(commands[1]).toEqual(commands[0]);
    }
  });

  it('renders human-readable authoritative source with no mutation action', async () => {
    const fetcher = fetchMock();
    vi.stubGlobal('fetch', fetcher);
    renderApp(route);
    expect(await screen.findByText('Chọn tiết dạy gốc')).toBeTruthy();
    await screen.findByText('Năm học 2026-2027');
    fireEvent.change(screen.getByLabelText('Ngày dạy'), { target: { value: '2026-10-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tiết dạy gốc' }));
    expect(await screen.findByText('Nguyễn Thị A')).toBeTruthy();
    expect(screen.getByText('10A1')).toBeTruthy();
    expect(screen.getByText(/Ngoại lệ lịch cần được đối soát PPCT/)).toBeTruthy();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('subjectId=subject-1'))).toBe(true);
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('/operational-overlays/calendar-exceptions/') && !String(url).includes('/operational-overlays/lesson-dispositions/'))).toBe(true);
  });


  it('shows blocked source without actionable lesson selection', async () => {
    vi.stubGlobal('fetch', fetchMock(allowed, 'BLOCKED'));
    renderApp(route);
    await screen.findByText('Năm học 2026-2027');
    fireEvent.change(screen.getByLabelText('Ngày dạy'), { target: { value: '2026-10-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tiết dạy gốc' }));
    expect(await screen.findByText('Nguồn không đủ điều kiện.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Tiết học đã xác minh')).toBeNull());
  });


  it('shows calendar preview for authorized school-wide calendar users without a commit command', async () => {
    const fetcher = fetchMock(calendarAuth);
    vi.stubGlobal('fetch', fetcher);
    renderApp(route);
    await screen.findByText('Năm học 2026-2027');
    fireEvent.change(screen.getByLabelText('Ngày dạy'), { target: { value: '2026-10-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tiết dạy gốc' }));
    expect(await screen.findByText('Xem trước ngoại lệ lịch học')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Phạm vi ngoại lệ'), { target: { value: 'CLASS' } });
    fireEvent.change(screen.getByLabelText('Thời gian áp dụng'), { target: { value: 'SESSION' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước số tiết bị ảnh hưởng' }));
    expect(await screen.findByText('1 tiết học')).toBeTruthy();
    expect(screen.getByText(/Chưa đánh giá đầy đủ tác động PPCT/)).toBeTruthy();
    const preview = fetcher.mock.calls.find(([path]) => String(path).endsWith('/workspace/calendar-preview'));
    expect(preview).toBeDefined();
    const body = JSON.parse(String(preview?.[1]?.body));
    expect(body).toMatchObject({
      academicYearId: 'year-1', academicCalendarVersionId: 'calendar-1',
      scope: 'CLASS', schoolClassId: 'class-1', timeSelector: 'SESSION', session: 'MORNING',
    });
    expect(fetcher.mock.calls.some(([path]) => String(path).endsWith('/operational-overlays/calendar-exceptions'))).toBe(false);
  });

  it('never exposes calendar preview to subject-only users', async () => {
    vi.stubGlobal('fetch', fetchMock(allowed));
    renderApp(route);
    await screen.findByText('Năm học 2026-2027');
    fireEvent.change(screen.getByLabelText('Ngày dạy'), { target: { value: '2026-10-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tiết dạy gốc' }));
    await screen.findByText('10A1');
    expect(screen.queryByText('Xem trước ngoại lệ lịch học')).toBeNull();
  });


  it('previews teacher substitution after loading candidates and does not commit a change', async () => {
    const fetcher = fetchMock(allowed);
    vi.stubGlobal('fetch', fetcher);
    renderApp(route);
    await screen.findByText('Năm học 2026-2027');
    fireEvent.change(screen.getByLabelText('Ngày dạy'), { target: { value: '2026-10-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tiết dạy gốc' }));
    await screen.findByText('Xem trước điều hành tiết dạy');
    expect(screen.queryByRole('option', { name: 'Hủy tiết theo thẩm quyền toàn trường' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Phương án xử lý'), { target: { value: 'SAME_SUBJECT_SUBSTITUTION' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm giáo viên có thể lựa chọn' }));
    expect(await screen.findByText(/Danh sách này chỉ xác minh tư cách giảng dạy/)).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Giáo viên B' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước phân công xử lý' }));
    expect(await screen.findByText(/Đã xác minh nguồn, quyền, tư cách giáo viên/)).toBeTruthy();
    const calls = fetcher.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
    expect(calls.some(([url]) => String(url).includes('teacher-options?') && String(url).includes('subjectId=subject-1'))).toBe(true);
    const preview = calls.find(([url]) => String(url).endsWith('/workspace/disposition-preview'));
    expect(preview?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(preview?.[1]?.body))).toMatchObject({
      academicYearId: 'year-1', subjectId: 'subject-1', timetableEntryId: 'entry-1',
      sourceCivilDate: '2026-10-22', dispositionType: 'SAME_SUBJECT_SUBSTITUTION',
      assignedTeacherUserId: 'teacher-2',
    });
    expect(calls.some(([url]) => String(url).endsWith('/operational-overlays/lesson-dispositions'))).toBe(false);
  });


  it('blocks different-subject supervision on conflict without creating a disposition', async () => {
    const fetcher = fetchMock(allowed, 'PASS', true);
    vi.stubGlobal('fetch', fetcher);
    renderApp(route);
    await screen.findByText('Năm học 2026-2027');
    fireEvent.change(screen.getByLabelText('Ngày dạy'), { target: { value: '2026-10-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tiết dạy gốc' }));
    await screen.findByText('Xem trước điều hành tiết dạy');
    fireEvent.change(screen.getByLabelText('Phương án xử lý'), { target: { value: 'DIFFERENT_SUBJECT_SUPERVISION' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm giáo viên có thể lựa chọn' }));
    await screen.findByText(/Danh sách này chỉ xác minh tư cách giảng dạy/);
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước phân công xử lý' }));
    expect(await screen.findByText('Tiết học gốc hoặc giáo viên chưa đủ điều kiện, hoặc có xung đột lịch. Kiểm tra lại lựa chọn trước khi xem trước lần nữa.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Xác nhận điều hành/ })).toBeNull();
    const calls = fetcher.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
    const preview = calls.find(([url]) => String(url).endsWith('/workspace/disposition-preview'));
    expect(JSON.parse(String(preview?.[1]?.body))).toMatchObject({
      dispositionType: 'DIFFERENT_SUBJECT_SUPERVISION',
      assignedTeacherUserId: 'teacher-2',
    });
    expect(calls.some(([url]) => String(url).endsWith('/operational-overlays/lesson-dispositions'))).toBe(false);
  });

  it('denies route to account without operational or calendar grant', async () => {
    const fetcher = fetchMock(normalAuth);
    vi.stubGlobal('fetch', fetcher);
    renderApp(route);
    await screen.findByText(/không có quyền/i);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/workspace/context'))).toBe(false);
  });
});
