import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const paged = (items: unknown[]) => ({ items, page: 1, pageSize: 20, total: items.length });
const year = { id: 'y', code: '2026-2027', name: 'Năm học 2026-2027' };
const permissions = { calendarSchoolWide: true, teachingSchoolWide: true, teachingSubjectIds: [] };
const raw = { message: 'SQL_INTERNAL secret-host', error: 'RAW_ENUM' };
async function mock(page: Page, options: { status?: number; first?: boolean; anonymous?: boolean; noGrants?: boolean; empty?: boolean; review?: boolean; gate?: Promise<void> } = {}) {
  const writes: string[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url.endsWith('/auth/me')) return route.fulfill({ status: options.anonymous ? 401 : 200, json: options.anonymous ? {} : {
      user: { id: 'mock', username: 'mock', displayName: 'Người kiểm thử', status: 'ACTIVE', mustChangePassword: Boolean(options.first) },
      capabilities: options.noGrants ? [] : ['ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', 'ADDITIONAL_DUTY_CATALOG_MANAGE', 'PPCT_MANAGE', 'APPROVAL_VICE_PRINCIPAL', 'TEACHING_OPERATION_MANAGE', 'CALENDAR_EXCEPTION_MANAGE'].map((key) => ({ key, scope: 'SCHOOL_WIDE' })),
    } });
    if (route.request().method() !== 'GET') {
      writes.push(url);
      if (url.endsWith('/inspect')) return route.fulfill({ json: { sourceFileName: 'ke-hoach.xlsx', sheets: [], dataSheetFound: false, issues: [
        { code: 'DATA_SHEET_NOT_FOUND', severity: 'BLOCKER', message: raw.message, sourceRowNumber: 2 },
        { code: 'constructor', severity: 'WARNING', message: raw.message, sourceRowNumber: 3 },
      ] } });
      return route.fulfill({ status: options.status ?? 409, json: raw });
    }
    if (options.gate) await options.gate;
    if (options.status) return route.fulfill({ status: options.status, json: raw });
    if (url.endsWith('/workspace/context')) return route.fulfill({ json: { years: [year], subjects: [], permissions } });
    if (url.endsWith('/workspace/options')) return route.fulfill({ json: { academicYears: options.empty ? [] : [year], masters: options.review ? [{ id: 'master', academicYearId: 'y', label: 'Kế hoạch trải nghiệm khối 10', kindLabel: 'Hoạt động trải nghiệm, hướng nghiệp', gradeLevel: 10, latestVersionNumber: 1, latestVersionStatus: 'DRAFT' }] : [] } });
    if (url.includes('/source-occurrences')) return route.fulfill({ json: { status: 'PASS', items: [{
      occurrenceKey: 'NORMAL:e:2026-10-22', timetableEntryId: 'e', academicCalendarVersionId: 'cal', civilDate: '2026-10-22',
      schoolClassId: 'c', schoolClassName: '10A1', gradeLevel: 10, subjectId: 's', subjectName: 'Toán', responsibleTeacherUserId: 't', responsibleTeacherName: 'Giáo viên A',
      selectable: true, effectiveKind: 'BASE_TIMETABLE', slot: { id: 'slot', weekday: 'THURSDAY', session: 'MORNING', startTime: '07:00', endTime: '07:45' },
    }], coverage: { ppctItemAllocation: 'NOT_ASSESSED' } } });
    if (url.endsWith('/ppct-options/academic-years')) return route.fulfill({ json: paged(options.empty ? [] : [year]) });
    if (url.endsWith('/ppct-options/academic-years/y')) return route.fulfill({ json: { academicYear: year, classes: [{ id: 'c', code: '10A1', name: '10A1', gradeLevel: 10, status: 'ACTIVE' }], subjects: [{ id: 's', code: 'TOAN', name: 'Toán', status: 'ACTIVE' }] } });
    if (url.endsWith('/ppct-plans')) return route.fulfill({ json: paged([{ id: 'plan', academicYearId: 'y', subjectId: 's', gradeLevel: 10 }]) });
    if (url.endsWith('/versions')) return route.fulfill({ json: paged([{ id: 'v', versionNumber: 1, status: 'PUBLISHED', itemCount: 2 }]) });
    if (url.endsWith('/ppct-associations')) return route.fulfill({ json: { items: [{ id: 'assoc', ppctVersionId: 'v', ppctVersionStatus: 'PUBLISHED', curricularProfile: 'CORE_ONLY', effectiveFrom: '2026-09-07', effectiveUntil: null, createdAt: '2026-09-01' }] } });
    if (url.endsWith('/health/live')) return route.fulfill({ json: { status: 'ok', timestamp: '2026-10-24', uptime: 1 } });
    if (url.endsWith('/health/ready')) return route.fulfill({ json: { status: 'ok', checks: { database: { status: 'ok', latencyMs: 1 } } } });
    return route.fulfill({ json: paged([]) });
  });
  return writes;
}

const routes = [
  ['/khong-co-quyen', 'Bạn không có quyền thực hiện thao tác này'],
  ['/khong-ton-tai-p5-058', 'Trang không tồn tại'],
  ['/quan-tri/kiem-nhiem/danh-muc', 'Loại kiêm nhiệm'],
  ['/quan-tri/kiem-nhiem/phan-cong', 'Kiêm nhiệm nhân sự'],
  ['/quan-tri/ppct/ap-dung-chuyen-de', 'Áp dụng chuyên đề'],
  ['/quan-tri/chuong-trinh-dac-thu', 'Kế hoạch HĐTN-HN và GDĐP'],
];
test('final slice pages: Vietnamese, responsive, reduced motion, keyboard and axe', async ({ page }) => {
  test.setTimeout(120_000);
  await mock(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [index, [route, heading]] of routes.entries()) {
    await page.goto(route!);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    if (index === 4) {
      await page.getByLabel('Lớp học', { exact: true }).selectOption('c');
      await page.getByLabel('Môn học', { exact: true }).selectOption('s');
      await expect(page.getByRole('cell', { name: 'Đã ban hành', exact: true })).toBeVisible();
    }
    if (index === 5) await page.getByRole('button', { name: 'Giáo dục địa phương (GDĐP)', exact: true }).click();
    for (const width of [320, 375, 414, 1366, 1440]) {
      await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `test-results/p5-058-slice7/page-${index}-${width}.png`, fullPage: true });
    }
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  }
  for (const first of [false, true]) {
    await page.unroute('**/api/**'); await mock(page, { first, anonymous: !first });
    await page.goto(first ? '/doi-mat-khau-lan-dau' : '/dang-nhap');
    const field = page.getByLabel(first ? 'Mật khẩu hiện tại' : 'Tên đăng nhập', { exact: true });
    await field.focus(); await page.keyboard.press('Tab');
    await expect(page.getByLabel(first ? 'Mật khẩu mới' : 'Mật khẩu', { exact: true })).toBeFocused();
    for (const width of [320, 375, 414, 1366, 1440]) {
      await page.setViewportSize({ width, height: width > 1000 ? 768 : 896 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `test-results/p5-058-slice7/auth-${first}-${width}.png`, fullPage: true });
    }
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  }
});

test('programme review list fits mobile with a keyboard-accessible detail action', async ({ page }) => {
  await mock(page, { review: true });
  await page.goto('/quan-tri/chuong-trinh-dac-thu');
  await page.getByRole('button', { name: 'Rà soát và vận hành kế hoạch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kế hoạch trải nghiệm khối 10', exact: true })).toBeVisible();
  const detail = page.getByRole('button', { name: 'Chọn xem chi tiết', exact: true });
  await detail.focus();
  await expect(detail).toBeFocused();
  for (const width of [320, 375, 414, 1366, 1440]) {
    await page.setViewportSize({ width, height: width > 1000 ? 768 : 896 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const box = await detail.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `test-results/p5-058-slice7/review-${width}.png`, fullPage: true });
  }
});

for (const status of [401, 403, 404, 409, 500]) test(`final slice query HTTP ${status} stays safe on four new routes`, async ({ page }) => {
  test.setTimeout(90_000);
  await mock(page, { status });
  for (const [route] of routes.slice(2)) {
    await page.goto(route!);
    if (status === 401) await expect(page).toHaveURL(/\/dang-nhap$/);
    else await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText(/SQL_INTERNAL|secret-host|RAW_ENUM/);
  }
});

test('new module loading and empty states are distinct', async ({ page }) => {
  for (const [route] of routes.slice(2)) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.unroute('**/api/**'); await mock(page, { empty: true, gate });
    await page.goto(route!);
    await expect(page.getByRole('status', { name: 'Đang tải dữ liệu' }).first()).toBeVisible();
    release();
    await expect(page.getByText(/Chưa có loại kiêm nhiệm$|Chưa có phân công kiêm nhiệm$|Chưa có năm học$|Chưa có năm học trong phạm vi được giao$/).first()).toBeVisible();
  }
});

test('final slice route guards deny missing grants without issuing commands', async ({ page }) => {
  const writes = await mock(page, { noGrants: true });
  for (const [route] of routes.slice(2)) {
    await page.goto(route!);
    await expect(page).toHaveURL(/\/khong-co-quyen$/);
    await expect(page.getByRole('heading', { name: 'Bạn không có quyền thực hiện thao tác này', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Về không gian làm việc', exact: true })).toHaveAttribute('href', '/');
  }
  expect(writes).toEqual([]);
});

test('programme findings keep severity and row while suppressing server text and unknown codes', async ({ page }) => {
  await mock(page);
  await page.goto('/quan-tri/chuong-trinh-dac-thu');
  await page.getByLabel('Chọn tệp Excel (.xlsx)', { exact: true }).setInputFiles({ name: 'ke-hoach.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('mock') });
  await page.getByRole('button', { name: 'Kiểm tra tệp', exact: true }).click();
  await expect(page.getByText(/Chưa tìm thấy trang dữ liệu theo mẫu/)).toBeVisible();
  await expect(page.getByText(/Lỗi cần xử lý \(Dòng 2\)/)).toBeVisible();
  await expect(page.getByText(/Cảnh báo \(Dòng 3\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xem trước kế hoạch' })).toBeDisabled();
  await expect(page.locator('body')).not.toContainText(/SQL_INTERNAL|secret-host|constructor/);
});

test('disposition and history panels: safe HTTP conflict without write retry', async ({ page }) => {
  const writes = await mock(page);
  await page.goto('/quan-tri/dieu-hanh-chuyen-mon');
  await page.getByLabel('Ngày dạy', { exact: true }).fill('2026-10-22');
  await page.getByRole('button', { name: 'Xem tiết dạy gốc', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Xem trước điều hành tiết dạy' })).toBeVisible();
  await page.getByRole('button', { name: 'Xem trước phân công xử lý', exact: true }).click();
  await expect(page.getByText('Chưa thể xác minh', { exact: true })).toBeVisible();
  expect(writes.filter((url) => url.endsWith('/disposition-preview'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Tải lịch sử điều hành', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có bản ghi điều hành' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/SQL_INTERNAL|secret-host|RAW_ENUM/);
  await page.screenshot({ path: 'test-results/p5-058-slice7/panels.png', fullPage: true });
});
