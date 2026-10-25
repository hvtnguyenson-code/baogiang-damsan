import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const grants = ['ACADEMIC_STRUCTURE_MANAGE', 'SUBJECT_MANAGE', 'HOMEROOM_ASSIGNMENT_MANAGE'].map((key) => ({ key, scope: 'SCHOOL_WIDE' }));
const year = { id: 'year-1', code: '2026-2027', name: 'Năm học kiểm thử', updatedAt: '2026-09-01T00:00:00Z' };
const routes = ['/quan-tri/cau-truc-nam-hoc', '/quan-tri/cau-truc-nam-hoc/year-1/lich', '/quan-tri/cau-truc-nam-hoc/year-1/lop', '/quan-tri/phan-cong-giang-day', '/quan-tri/phan-cong-chu-nhiem'];

describe('P5-058 academic presentation boundaries', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  for (const route of routes) for (const status of [401, 403, 409]) {
    it(`${route}: HTTP ${status} uses safe recovery without raw response`, async () => {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me')
        ? jsonResponse({ ...normalAuth, capabilities: grants })
        : jsonResponse({ message: 'SQL_INTERNAL hidden-uuid secret-host', error: 'RAW_CODE' }, status)));
      renderApp(route);
      if (status === 401) expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
      if (status === 403) expect(await screen.findByRole('link', { name: 'Về trang công việc' })).toHaveAttribute('href', '/');
      if (status === 409) expect(await screen.findByRole('button', { name: 'Tải lại dữ liệu' })).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/SQL_INTERNAL|hidden-uuid|secret-host|RAW_CODE/);
    });
  }

  it('keeps the year draft and exact normalized payload after conflict, without automatic retry', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/auth/me')) return jsonResponse({ ...normalAuth, capabilities: grants });
      if (init?.method === 'POST') return jsonResponse({ message: 'SQL_INTERNAL' }, 409);
      return jsonResponse({ items: [year], page: 1, pageSize: 20, total: 1 });
    });
    vi.stubGlobal('fetch', fetchMock); renderApp(routes[0]);
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo năm học' }));
    await userEvent.type(screen.getByLabelText('Mã năm học'), ' nh26 ');
    await userEvent.type(screen.getByLabelText('Tên năm học'), ' Năm học mới ');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu năm học' }));
    await screen.findByText(/Dữ liệu xung đột/);
    expect(screen.getByLabelText('Tên năm học')).toHaveValue(' Năm học mới ');
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0]![1]?.body))).toEqual({ code: 'NH26', name: 'Năm học mới' });
    expect(screen.queryByText('Đã lưu năm học.')).not.toBeInTheDocument();
  });
});
