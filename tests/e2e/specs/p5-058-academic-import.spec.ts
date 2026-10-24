import path from 'node:path';
import { expect, test } from '@playwright/test';

// Browser mock evidence only. The importer/parser and the server remain authoritative.
test('P5-058: Vietnamese PPCT preview, target invalidation, confirm and readiness labels', async ({ page }) => {
  test.setTimeout(90_000);
  let confirms = 0;
  const target = { gradeLevel: 10, targetMode: 'CREATE_NEW_DRAFT', targetDraftId: null, expectedUpdatedAt: null };
  const year = { id: 'mock-year', name: 'Năm học 2026-2027', code: '2026-2027' };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: {
      user: { id: 'mock-manager', username: 'manager', displayName: 'Người quản lý (MOCK)', status: 'ACTIVE', mustChangePassword: false },
      capabilities: ['PPCT_MANAGE', 'TIMETABLE_MANAGE', 'USER_MANAGE'].map((key) => ({ key, scope: 'SCHOOL_WIDE' })),
    } });
    if (url.pathname === '/api/ppct-import/inspect') return route.fulfill({ json: {
      sourceFileName: 'ppct.xlsx', metadata: { subjectDisplayName: 'Toán', academicYearCode: year.code, templateVersion: 'PPCT_V1' },
      gradeLevels: [10], issues: [], sheets: [],
    } });
    if (url.pathname === '/api/ppct-import/preview') return route.fulfill({ json: {
      sourceFileName: 'ppct.xlsx', subject: { name: 'Toán' }, academicYear: year, requestFingerprint: 'opaque-fingerprint', issues: [],
      grades: [{ gradeLevel: 10, corePeriodCount: 70, specializedPeriodCount: 35, target,
        drafts: [{ id: 'mock-draft', versionNumber: 2, itemCount: 105, updatedAt: '2026-10-24T00:00:00Z' }] }],
    } });
    if (url.pathname === '/api/ppct-import/confirm') {
      confirms++;
      expect(route.request().postData()).toContain('opaque-fingerprint');
      return route.fulfill({ json: { results: [{ gradeLevel: 10, outcome: 'CREATED', version: { versionNumber: 3, status: 'DRAFT' } }] } });
    }
    if (url.pathname === '/api/data-readiness/summary') return route.fulfill({ json: {
      academicYear: year, academicYears: [year], overallStatus: 'NOT_READY', overallStatusLabel: 'Chưa sẵn sàng',
      evaluatedAt: '2026-10-24T00:00:00Z',
      domains: [
        ['TKB', 'Thời khóa biểu (TKB)', '/quan-tri/thoi-khoa-bieu'],
        ['PPCT', 'Phân phối chương trình (PPCT)', '/quan-tri/ppct/nhap'],
        ['HISTORICAL_TEACHING', 'Lịch sử giảng dạy', '/quan-tri/lich-su-giang-day'],
        ['GDDP', 'Giáo dục địa phương (GDĐP)', '/quan-tri/chuong-trinh-dac-thu'],
        ['HDTN_HN', 'Hoạt động trải nghiệm, hướng nghiệp (HĐTN-HN)', '/quan-tri/chuong-trinh-dac-thu'],
      ].map(([key, label, to]) => ({ key, label, description: 'Dữ liệu kiểm thử giao diện (MOCK).', status: 'NOT_READY', statusLabel: 'Chưa sẵn sàng',
        latestVersion: { number: 1, status: 'DRAFT', updatedAt: '2026-10-24T00:00:00Z' }, latestImport: null,
        findings: [], nextAction: 'Kiểm tra bản nháp trước khi áp dụng.', primaryAction: { label: 'Mở trang quản lý', to }, workflowSteps: [], stats: {},
      })),
    } });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/quan-tri/ppct/nhap');
  await page.getByLabel('Tệp PPCT (.xlsx)').setInputFiles({ name: 'ppct.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('mock') });
  await page.getByRole('button', { name: 'Kiểm tra tệp', exact: true }).click();
  await page.getByRole('button', { name: 'Xem trước nhập PPCT' }).click();
  await expect(page.getByRole('columnheader', { name: 'Chương trình chính khóa' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/Fingerprint|workbook|CORE|DRAFT/);
  for (const width of [320, 375, 414, 1366, 1440]) {
    await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.resolve('test-results/p5-058', `ppct-preview-${width}.png`), fullPage: true });
  }
  await page.getByLabel('Cách nhập khối 10').selectOption('UPDATE_EXACT_DRAFT');
  const confirm = page.getByRole('button', { name: 'Xác nhận nhập vào bản nháp' });
  await expect(confirm).toBeDisabled();
  expect(confirms).toBe(0);
  const refresh = page.getByRole('button', { name: 'Xem trước lại', exact: true });
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText(/Đã nhập PPCT ở trạng thái bản nháp/)).toBeVisible();
  expect(confirms).toBe(1);
  await expect(confirm).toHaveCount(0);

  await page.goto('/quan-tri/san-sang-du-lieu');
  await expect(page.getByText('Phiên bản #1 (Bản nháp)')).toHaveCount(5);
  await expect(page.getByTestId('overall-status-badge')).toContainText('Chưa sẵn sàng');
  await expect(page.getByText(/Mỗi nhóm có quy trình riêng/)).toBeVisible();
  for (const width of [320, 375, 414, 1366, 1440]) {
    await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
    await page.screenshot({ path: path.resolve('test-results/p5-058', `readiness-${width}.png`), fullPage: true });
  }
});
