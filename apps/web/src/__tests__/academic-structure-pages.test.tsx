import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, normalAuth, renderApp } from './test-utils';

const academicAuth = { ...normalAuth, capabilities: [{ key: 'ACADEMIC_STRUCTURE_MANAGE' as const, scope: 'SCHOOL_WIDE' as const }] };
const year = { id: 'year-1', code: '2026-2027', name: 'Năm học 2026–2027', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

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
    expect(screen.getAllByText(/Tuần (chính thức|dự phòng) · thứ tự/, { selector: 'summary' })).toHaveLength(3);
    expect(screen.getByDisplayValue('DP1')).toBeInTheDocument();
    expect(screen.getByLabelText('Số tuần chính thức')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại khung tuần' }));
    expect(screen.getByText('Đặt lại sẽ xóa toàn bộ tuần và khoảng đã nhập.')).toBeInTheDocument();
    expect(screen.getAllByText(/Tuần (chính thức|dự phòng) · thứ tự/, { selector: 'summary' })).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận đặt lại' }));
    expect(screen.queryByText(/Tuần chính thức · thứ tự/, { selector: 'summary' })).not.toBeInTheDocument();
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
});
