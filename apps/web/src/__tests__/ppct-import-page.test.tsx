import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PpctImportPage } from '../pages/PpctImportPage';
import { jsonResponse, renderWithQuery } from './test-utils';

const target = { gradeLevel: 10, targetMode: 'CREATE_NEW_DRAFT', targetDraftId: null, expectedUpdatedAt: null };
const inspection = {
  sourceFileName: 'ppct.xlsx', metadata: { subjectDisplayName: 'Toán', academicYearCode: '2026-2027', templateVersion: 'PPCT_V1' },
  sheets: [], gradeLevels: [10], issues: [],
};
const preview = {
  sourceFileName: 'ppct.xlsx', requestFingerprint: 'opaque-fingerprint',
  subject: { name: 'Toán' }, academicYear: { code: '2026-2027' }, issues: [],
  grades: [{ gradeLevel: 10, corePeriodCount: 70, specializedPeriodCount: 35, target,
    drafts: [{ id: 'draft-1', versionNumber: 2, itemCount: 105, updatedAt: '2026-10-24T00:00:00Z' }] }],
};

function mockApi(failure?: { step: string; status: number }, blocked = false) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (failure && url.endsWith(`/${failure.step}`)) return jsonResponse({ message: 'DRAFT SQL_INTERNAL', error: 'Forbidden' }, failure.status);
    if (url.endsWith('/inspect')) return jsonResponse({ ...inspection, issues: blocked ? [{ severity: 'BLOCKER', code: 'INVALID_SHEET', message: 'Thiếu trang tính bắt buộc.' }] : [] });
    if (url.endsWith('/preview')) return jsonResponse(preview);
    if (url.endsWith('/confirm')) return jsonResponse({ results: [{ gradeLevel: 10, outcome: 'CREATED', version: { versionNumber: 3, status: 'DRAFT' } }] });
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function inspect() {
  fireEvent.change(screen.getByLabelText('Tệp PPCT (.xlsx)'), { target: { files: [new File(['mock'], 'ppct.xlsx')] } });
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra tệp' }));
  await screen.findByRole('heading', { name: '2. Kết quả kiểm tra' });
}

async function showPreview() {
  await inspect();
  fireEvent.click(screen.getByRole('button', { name: 'Xem trước nhập PPCT' }));
  await screen.findByRole('heading', { name: '3. Xem trước và chọn bản nháp đích' });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('P5-058 PPCT Vietnamese import copy and retained lifecycle', () => {
  it('uses Vietnamese labels, confirms once with unchanged protocol fields, then clears preview', async () => {
    const fetchMock = mockApi();
    renderWithQuery(<PpctImportPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nhập phân phối chương trình (PPCT) từ Excel');
    await showPreview();
    expect(screen.getByRole('columnheader', { name: 'Chương trình chính khóa' })).toBeInTheDocument();
    expect(screen.getByText('Tạo bản nháp kế tiếp')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Fingerprint|workbook|CORE|DRAFT|draft/);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhập vào bản nháp' }));
    expect(await screen.findByText(/Đã nhập PPCT ở trạng thái bản nháp/)).toHaveTextContent('Chưa có phiên bản nào được tự động công bố');
    const calls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/confirm'));
    expect(calls).toHaveLength(1);
    const options = (fetchMock.mock.calls as unknown as Array<[unknown, RequestInit]>).find(([url]) => String(url).endsWith('/confirm'))![1];
    const body = options.body as FormData;
    expect(body.get('requestFingerprint')).toBe('opaque-fingerprint');
    expect(JSON.parse(body.get('targets') as string)).toEqual([target]);
    expect(screen.queryByRole('button', { name: 'Xác nhận nhập vào bản nháp' })).not.toBeInTheDocument();
  });

  it('blocks confirm after target change until preview is refreshed and clears it when file changes', async () => {
    const fetchMock = mockApi();
    renderWithQuery(<PpctImportPage />);
    await showPreview();
    fireEvent.change(screen.getByLabelText('Cách nhập khối 10'), { target: { value: 'UPDATE_EXACT_DRAFT' } });
    expect(screen.getByRole('button', { name: 'Xác nhận nhập vào bản nháp' })).toBeDisabled();
    expect(screen.getByText(/Hãy xem trước lại để kiểm tra đúng bản nháp/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/confirm'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước lại' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xác nhận nhập vào bản nháp' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Tệp PPCT (.xlsx)'), { target: { files: [new File(['new'], 'other.xlsx')] } });
    expect(screen.queryByRole('button', { name: 'Xác nhận nhập vào bản nháp' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/confirm'))).toBe(false);
  });

  it('retains blocking inspection evidence and prevents preview or confirmation', async () => {
    const fetchMock = mockApi(undefined, true);
    renderWithQuery(<PpctImportPage />);
    await inspect();
    expect(screen.getByRole('alert')).toHaveTextContent('Hãy sửa tệp Excel rồi kiểm tra lại');
    expect(screen.getByRole('button', { name: 'Xem trước nhập PPCT' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, 'Phiên đăng nhập đã hết hạn', 'Đăng nhập lại'],
    [403, 'Tài khoản chưa được cấp quyền', 'Về trang công việc'],
    [409, 'Dữ liệu xung đột', 'Tải lại dữ liệu'],
  ])('presents confirm %s safely without a success claim or automatic retry', async (status, message, action) => {
    const fetchMock = mockApi({ step: 'confirm', status: Number(status) });
    renderWithQuery(<PpctImportPage />);
    await showPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhập vào bản nháp' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(String(message));
    expect(alert).not.toHaveTextContent(/DRAFT|SQL_INTERNAL|Forbidden/);
    expect(screen.getByRole(Number(status) === 409 ? 'button' : 'link', { name: String(action) })).toBeInTheDocument();
    expect(screen.queryByText(/Đã nhập PPCT ở trạng thái/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/confirm'))).toHaveLength(1);
  });

  it('does not expose confirm or claim readiness after preview fails', async () => {
    const fetchMock = mockApi({ step: 'preview', status: 409 });
    renderWithQuery(<PpctImportPage />);
    await inspect();
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước nhập PPCT' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dữ liệu xung đột');
    expect(screen.queryByRole('button', { name: 'Xác nhận nhập vào bản nháp' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/confirm'))).toBe(false);
  });
});
