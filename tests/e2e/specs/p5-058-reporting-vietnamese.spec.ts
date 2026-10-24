import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Browser/API mocks only; these fixtures do not establish production readiness.
const year = { id: 'mock-year', code: '2026-2027', name: 'Năm học 2026–2027', activeCalendar: { startDate: '2026-08-01', endDate: '2027-05-31' } };
const counts = { distributedElapsedCount: 2, completedCount: 1, openDebtCount: 1, lateCount: 0, unconfirmedGapCount: 0 };
const preview = { status: 'PASS', responsibilityState: 'RESPONSIBILITY_PRESENT', eligibleForSubmission: true, counts, sections: [], responsibilityManifest: [], findings: [] };
const summary = {
  revisionId: 'mock-revision', academicYearId: year.id, submitterDisplayNameSnapshot: 'Giáo viên kiểm thử (MOCK)', submitterStaffCodeSnapshot: 'GV-MOCK',
  fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', submittedAt: '2026-08-29T01:00:00Z', lifecycleState: 'SUBMITTED',
};

test('P5-058: teacher preview and submit conflict use safe Vietnamese across viewports', async ({ page }) => {
  test.setTimeout(90_000);
  let blocked = true;
  const submits: unknown[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: {
      user: { id: 'teacher-mock', username: 'teacher', displayName: 'Giáo viên (MOCK)', status: 'ACTIVE', mustChangePassword: false },
      capabilities: [{ key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' }, { key: 'REPORTING_STATEMENT_READ', scope: 'PERSONAL' }],
    } });
    if (url.pathname.endsWith('/workspace-context')) return route.fulfill({ json: {
      academicYears: [year], selectedAcademicYear: url.searchParams.has('academicYearId') ? { ...year, schoolClasses: [], subjects: [] } : null,
    } });
    if (url.pathname.endsWith('/preview')) return route.fulfill({ json: blocked ? {
      ...preview, status: 'BLOCKED', eligibleForSubmission: false,
      findings: [{ code: 'UPSTREAM_ALLOCATION_BLOCKED', severity: 'BLOCKER', message: 'SQL_INTERNAL UNKNOWN_ENUM hidden-uuid' }],
      officialWorkload: { status: 'BLOCKED', earnedCredit: null, requiredCredit: null, varianceCredit: null, findings: [{ code: 'TEACHING_WEEKDAYS_EMPTY', message: 'calendar.uuid teachingWeekdays' }] },
    } : preview });
    if (url.pathname === '/api/reporting-statements' && route.request().method() === 'POST') {
      submits.push(route.request().postDataJSON());
      return route.fulfill({ status: 409, json: { message: 'CAS_MISMATCH hidden-token', error: 'RAW_SERVER_CODE' } });
    }
    return route.fulfill({ json: { items: [], page: 1, pageSize: 10, total: 0 } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/bao-cao-ke-khai');
  await expect(page.getByLabel('Từ ngày', { exact: true })).toBeEnabled();
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-08-01');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2026-08-31');
  const previewButton = page.getByRole('button', { name: 'Xem trước báo cáo', exact: true });
  await previewButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Chưa thể phân bổ phân phối chương trình/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gửi báo cáo', exact: true })).toBeDisabled();
  await expect(page.getByText('Chưa xác định', { exact: true })).toHaveCount(5);
  await expect(page.locator('main')).not.toContainText(/SQL_INTERNAL|UNKNOWN_ENUM|hidden-uuid|teachingWeekdays|calendar.uuid/);
  for (const width of [320, 375, 414, 1366, 1440]) {
    await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: path.resolve('test-results/p5-058', `reporting-preview-${width}.png`), fullPage: true });
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  blocked = false;
  await previewButton.click();
  await expect(page.getByRole('button', { name: 'Gửi báo cáo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click();
  await expect(page.getByText('Hãy xem trước lại báo cáo trước khi tạo yêu cầu mới.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải lại dữ liệu', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử gửi lại', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gửi báo cáo', exact: true })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/CAS_MISMATCH|hidden-token|RAW_SERVER_CODE|Đã gửi báo cáo/);
  expect(submits).toHaveLength(1);
  expect(submits[0]).toMatchObject({ academicYearId: year.id, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: expect.any(String) });
  await expect(page.getByLabel('Từ ngày', { exact: true })).toHaveValue('2026-08-01');
});

test('P5-058: BGH reporting list, empty, loading, conflict and admin navigation', async ({ page }) => {
  test.setTimeout(90_000);
  let listMode: 'items' | 'empty' | 'forbidden' = 'items';
  let decision = false;
  let decisions = 0;
  let releaseList!: () => void;
  const waitingList = new Promise<void>((resolve) => { releaseList = resolve; });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: {
      user: { id: 'manager-mock', username: 'manager', displayName: 'Ban giám hiệu (MOCK)', status: 'ACTIVE', mustChangePassword: false },
      capabilities: [
        { key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' }, { key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' },
        { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' }, { key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' }, { key: 'AUDIT_VIEW', scope: 'SCHOOL_WIDE' },
      ],
    } });
    if (url.pathname.endsWith('/workspace-context')) return route.fulfill({ json: { academicYears: [year], selectedAcademicYear: { ...year, schoolClasses: [], subjects: [] } } });
    if (url.pathname.endsWith('/pending-decision')) {
      await waitingList;
      return listMode === 'forbidden'
        ? route.fulfill({ status: 403, json: { message: 'Forbidden CAPABILITY_KEY SQL_INTERNAL' } })
        : route.fulfill({ json: { items: listMode === 'items' ? [summary] : [], page: 1, pageSize: 15, total: listMode === 'items' ? 1 : 0 } });
    }
    if (url.pathname.endsWith('/approve')) {
      decisions++;
      decision = true;
      return route.fulfill({ status: 409, json: { message: 'CAS_MISMATCH expectedLifecycleToken' } });
    }
    if (url.pathname.endsWith('/mock-revision')) return route.fulfill({ json: {
      ...summary, counts, lifecycleState: decision ? 'APPROVED' : 'SUBMITTED', lifecycleToken: 'hidden-token', asOfInstant: summary.submittedAt,
      sections: [], responsibilityManifest: [], history: [], allowedActions: decision ? [] : ['APPROVE', 'REJECT'],
    } });
    return route.fulfill({ json: { items: [], page: 1, pageSize: 15, total: 0 } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/phe-duyet-bao-cao', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Đang tải dữ liệu', { exact: true })).toBeVisible();
  releaseList();
  await page.getByRole('link', { name: 'Mở báo cáo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chi tiết báo cáo kê khai' })).toBeVisible();
  for (const width of [320, 375, 414, 1366, 1440]) {
    await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: path.resolve('test-results/p5-058', `reporting-detail-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Phê duyệt báo cáo', exact: true }).focus();
  await page.keyboard.press('Enter');
  expect(decisions).toBe(0);
  await page.getByRole('button', { name: 'Xác nhận phê duyệt', exact: true }).click();
  await expect(page.getByText('Đã phê duyệt', { exact: true })).toBeVisible();
  await expect(page.getByText('Đã ghi nhận quyết định', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Phê duyệt báo cáo', exact: true })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/CAS_MISMATCH|expectedLifecycleToken|hidden-token/);
  expect(decisions).toBe(1);
  await page.getByRole('link', { name: 'Quay lại hàng đợi phê duyệt' }).click();
  listMode = 'forbidden';
  await page.reload();
  await expect(page.getByText('Tài khoản chưa được cấp quyền thực hiện thao tác này.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Về trang công việc' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/Forbidden|CAPABILITY_KEY|SQL_INTERNAL/);
  listMode = 'empty';
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Không có báo cáo đang chờ' })).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 768 });
  const admin = page.getByRole('button', { name: 'Quản trị', exact: true });
  await admin.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Người dùng', exact: true })).toHaveAttribute('href', '/quan-tri/nguoi-dung');
  await expect(page.getByRole('link', { name: 'Cấp quyền', exact: true })).toHaveAttribute('href', '/quan-tri/quyen');
  await expect(page.getByRole('link', { name: 'Nhật ký', exact: true })).toHaveAttribute('href', '/quan-tri/nhat-ky');
  await page.keyboard.press('Escape');
  await expect(admin).toBeFocused();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
