import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EffectiveSchedulePage } from '../pages/EffectiveSchedulePage';
import { HistoricalTeachingPage } from '../pages/HistoricalTeachingPage';
import { TeachingOperationsPage } from '../pages/TeachingOperationsPage';
import { historicalIssueLabel, sessionLabel, curricularComponentLabel } from '../lib/teaching-workflow-presentation';
import { jsonResponse, normalAuth, renderApp, renderWithQuery } from './test-utils';

afterEach(() => { vi.unstubAllGlobals(); });
const forbiddenRaw = /SQL_INTERNAL|CAS_MISMATCH|hidden-uuid|RAW_SERVER_CODE/;
const messages = { 401: /Phiên đăng nhập đã hết hạn/, 403: /Tài khoản chưa được cấp quyền/, 409: /Dữ liệu xung đột/ };

describe('P5-058 slice 4: teacher workflow Vietnamese', () => {
  for (const [name, Page] of [['schedule', EffectiveSchedulePage], ['operations', TeachingOperationsPage], ['history', HistoricalTeachingPage]] as const) {
    it.each([401, 403, 409] as const)(`${name}: HTTP %i retains recovery meaning without server details`, async (status) => {
      const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ message: 'SQL_INTERNAL CAS_MISMATCH hidden-uuid', error: 'RAW_SERVER_CODE' }, status));
      vi.stubGlobal('fetch', fetcher);
      renderWithQuery(<Page />);
      expect(await screen.findByText(messages[status])).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(forbiddenRaw);
      if (status === 401) expect(screen.getByRole('link', { name: 'Đăng nhập lại' })).toHaveAttribute('href', '/dang-nhap');
      if (status === 403) expect(screen.getByRole('link', { name: 'Về trang công việc' })).toHaveAttribute('href', '/');
      if (status === 409) expect(screen.getByRole('button', { name: 'Tải lại dữ liệu' })).toBeInTheDocument();
      expect(fetcher.mock.calls.every((call) => !call[1]?.method || call[1]?.method === 'GET')).toBe(true);
    });
  }

  it('history preview translates issue codes, session and component; confirm conflict sends one unchanged command', async () => {
    const commands: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/options')) return jsonResponse({ academicYears: [{ id: 'year', code: '2026', name: 'Năm học kiểm thử' }], selectedAcademicYearId: 'year', classes: [], subjects: [] });
      if (url.includes('/preview')) return jsonResponse({ canConfirm: true, batchRef: 'batch-ref', requestFingerprint: 'fingerprint', operationalStartDate: '2026-10-01', issues: [{ code: 'HISTORY_SOURCE_TOO_LARGE', message: 'SQL_INTERNAL', severity: 'ADVISORY' }], rows: [{ rowRef: 'row', rowNumber: 1, kind: 'NORMAL', sourceCivilDate: '2026-09-01', sourceSession: 'MORNING', sourceOrdinal: 1, schoolClassCode: '10A1', subjectCode: 'TOAN', actualTeacherDisplayName: 'Giáo viên thử', ppct: { component: 'CORE', sequence: 1, title: 'Bài học thử' }, status: 'READY', issues: [] }] });
      if (url.includes('/confirm')) { commands.push(JSON.parse(String(init?.body))); return jsonResponse({ message: 'CAS_MISMATCH hidden-uuid' }, 409); }
      return jsonResponse({});
    }));
    renderWithQuery(<HistoricalTeachingPage />);
    await screen.findByText(/Năm học kiểm thử/);
    fireEvent.change(screen.getByLabelText('Dữ liệu lịch sử (CSV hoặc dán từ bảng tính)'), { target: { value: 'unchanged-source' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước và đối chiếu' }));
    expect(await screen.findByText(/Dữ liệu vượt quá 512 KiB/)).toBeInTheDocument();
    expect(screen.getByText(/Buổi sáng/)).toBeInTheDocument();
    expect(screen.getByText(/Chương trình chính khóa/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nạp 1 dòng' }));
    expect(await screen.findByText(messages[409])).toBeInTheDocument();
    expect(commands).toEqual([{ academicYearId: 'year', sourceText: 'unchanged-source', batchRef: 'batch-ref', requestFingerprint: 'fingerprint', requestKey: expect.any(String) }]);
    expect(document.body).not.toHaveTextContent(forbiddenRaw);
  });

  it('profile keeps failed delivery separate from sent and suppresses provider details', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse(normalAuth);
      if (url.endsWith('/telegram/me')) return jsonResponse({ enabled: true, linked: true });
      if (url.endsWith('/telegram/test')) return jsonResponse({ deliveryStatus: 'UNKNOWN', error: 'SQL_INTERNAL hidden-uuid' });
      return jsonResponse({});
    }));
    renderApp('/ho-so');
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi tin thử' }));
    expect(await screen.findByText(/Hãy kiểm tra liên kết Telegram và thử gửi lại/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(forbiddenRaw);
    expect(screen.queryByText('Gửi tin thử thành công')).not.toBeInTheDocument();
  });

  it('makeup loading does not claim no schedules; errors do not become empty lists', async () => {
    let resolveSchedules!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return jsonResponse({ ...normalAuth, capabilities: [{ key: 'TEACHING_OPERATION_MANAGE', scope: 'SCHOOL_WIDE' }] });
      if (url.endsWith('/operational-overlays/workspace/context')) return jsonResponse({ years: [{ id: 'year', name: 'Năm học thử' }], subjects: [], permissions: { teachingSchoolWide: true, teachingSubjectIds: [], calendarSchoolWide: false } });
      if (url.includes('/candidates')) return jsonResponse({ status: 'PASS', items: [] });
      if (url.includes('/makeup-schedules')) return new Promise<Response>((resolve) => { resolveSchedules = resolve; });
      return jsonResponse({});
    }));
    renderApp('/quan-tri/lich-day-bu');
    await waitFor(() => { expect(resolveSchedules).toBeTypeOf('function'); expect(screen.getByText('Đang tải lịch dạy bù…')).toBeInTheDocument(); });
    expect(screen.queryByText('Chưa có lịch dạy bù nào')).not.toBeInTheDocument();
    resolveSchedules(jsonResponse({ message: 'SQL_INTERNAL' }, 403));
    expect(await screen.findByText(messages[403])).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Chưa có lịch dạy bù nào')).not.toBeInTheDocument());
  });

  it('unknown presentation values stay unknown', () => {
    expect(historicalIssueLabel('SQL_INTERNAL')).toMatch(/chưa xác định/);
    expect(historicalIssueLabel('constructor')).toMatch(/chưa xác định/);
    expect(sessionLabel('UNKNOWN')).toBe('Chưa xác định buổi');
    expect(curricularComponentLabel('UNKNOWN')).toBe('Chưa xác định thành phần chương trình');
  });
});
