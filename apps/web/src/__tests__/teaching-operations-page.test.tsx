import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const route = '/quan-tri/dieu-hanh-chuyen-mon';
const allowed = {
  ...normalAuth,
  capabilities: [{ key: 'TEACHING_OPERATION_MANAGE' as const, scope: 'SUBJECT' as const, resourceId: 'subject-1' }],
};

function fetchMock(auth: unknown = allowed, status: 'PASS' | 'BLOCKED' = 'PASS') {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return jsonResponse(auth);
    if (url.endsWith('/operational-overlays/workspace/context')) return jsonResponse({
      years: [{ id: 'year-1', code: '2026-2027', name: 'Năm học 2026-2027' }],
      subjects: [{ id: 'subject-1', code: 'TOAN', name: 'Toán' }],
      permissions: { calendarSchoolWide: false, teachingSchoolWide: false, teachingSubjectIds: ['subject-1'] },
    });
    if (url.includes('/operational-overlays/workspace/source-occurrences?')) {
      if (status === 'BLOCKED') return jsonResponse({ status, items: [], reason: 'Nguồn không đủ điều kiện.', coverage: { ppctItemAllocation: 'NOT_ASSESSED' } });
      return jsonResponse({
        status, coverage: { ppctItemAllocation: 'NOT_ASSESSED' },
        items: [{
          occurrenceKey: 'NORMAL:entry-1:2026-10-22', timetableEntryId: 'entry-1', civilDate: '2026-10-22',
          schoolClassId: 'class-1', schoolClassName: '10A1', subjectId: 'subject-1', subjectName: 'Toán',
          gradeLevel: 10, responsibleTeacherUserId: 'teacher-1', responsibleTeacherName: 'Nguyễn Thị A',
          slot: { id: 'slot-1', weekday: 'THURSDAY', session: 'MORNING', startTime: '07:00:00', endTime: '07:45:00' },
          effectiveKind: 'BASE_TIMETABLE', selectable: true,
        }],
      });
    }
    return jsonResponse({});
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('P5-054 source selection workspace', () => {
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
    expect(screen.getByText(/Chức năng xác nhận thay đổi chưa mở/)).toBeTruthy();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('subjectId=subject-1'))).toBe(true);
    expect(fetcher.mock.calls.every(([, init]) => !init || (init as RequestInit).method !== 'POST')).toBe(true);
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

  it('denies route to account without operational or calendar grant', async () => {
    const fetcher = fetchMock(normalAuth);
    vi.stubGlobal('fetch', fetcher);
    renderApp(route);
    await screen.findByText(/không có quyền/i);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/workspace/context'))).toBe(false);
  });
});
