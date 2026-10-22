import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationalHistoryPanel } from '../pages/OperationalHistoryPanel';
import { jsonResponse, renderWithQuery } from './test-utils';

const calendarOnly = {
  years: [{ id: 'year-1', code: '2026-2027', name: 'Năm học 2026-2027' }],
  subjects: [],
  permissions: { calendarSchoolWide: true, teachingSchoolWide: false, teachingSubjectIds: [] },
};
const subjectOnly = {
  years: [{ id: 'year-1', code: '2026-2027', name: 'Năm học 2026-2027' }],
  subjects: [{ id: 'subject-1', code: 'TOAN', name: 'Toán' }],
  permissions: { calendarSchoolWide: false, teachingSchoolWide: false, teachingSubjectIds: ['subject-1'] },
};

const calendarRecord = {
  id: 'calendar-row', civilDate: '2026-10-22', status: 'ACTIVE',
  scope: 'SCHOOL_WIDE', timeSelector: 'WHOLE_DAY', updatedAt: '2026-10-22T01:00:00.000Z',
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('P5-054 retained operational history and guarded reversal', () => {
  it('loads only subject-scoped disposition history for subject users', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes('/lesson-dispositions?')) return jsonResponse({ items: [], total: 0, page: 1, pageSize: 50 });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetcher);
    renderWithQuery(<OperationalHistoryPanel context={subjectOnly} yearId="year-1" subjectId="subject-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tải lịch sử điều hành' }));
    await screen.findByText('Chưa có bản ghi điều hành');
    const urls = fetcher.mock.calls.map(([path]) => String(path));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/lesson-dispositions?');
    expect(urls[0]).toContain('subjectId=subject-1');
    expect(urls[0]).not.toContain('/calendar-exceptions?');
  });

  it('keeps original calendar record and sends CAS/idempotency on reversal', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'safe-request-key' });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes('/calendar-exceptions?')) return jsonResponse({ items: [calendarRecord], total: 1, page: 1, pageSize: 50 });
      if (path.endsWith('/calendar-row/reverse') && init?.method === 'POST') {
        return jsonResponse({ outcome: 'REVERSED', record: { ...calendarRecord, status: 'REVERSED' } });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetcher);
    renderWithQuery(<OperationalHistoryPanel context={calendarOnly} yearId="year-1" subjectId="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tải lịch sử điều hành' }));
    expect(await screen.findByText('Đang có hiệu lực')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(screen.getByRole('button', { name: 'Xác nhận hoàn tác' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Lý do hoàn tác'), { target: { value: 'Quyết định điều chỉnh lịch học' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hoàn tác' }));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/calendar-row/reverse'))).toBe(true));
    const calls = fetcher.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
    const reverse = calls.find(([url]) => String(url).endsWith('/calendar-row/reverse'));
    expect(reverse?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(reverse?.[1]?.body))).toEqual({
      expectedUpdatedAt: '2026-10-22T01:00:00.000Z',
      reversalReason: 'Quyết định điều chỉnh lịch học',
      requestKey: 'ops-rev-safe-request-key',
    });
    expect(calls.some(([url]) => String(url).endsWith('/calendar-exceptions'))).toBe(false);
  });
});
