import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Deterministic presentation fixtures only; no live backend or production mutation.
const year = { id: 'year-mock', code: '2026-2027', name: 'Năm học kiểm thử' };
const context = { academicYears: [year], currentAcademicYearId: year.id, weeks: [{ id: 'week-mock', displayLabel: 'Tuần kiểm thử', startDate: '2026-09-07', endDate: '2026-09-12' }], currentAcademicWeekId: 'week-mock', currentCivilDate: '2026-09-07' };
const grants = [{ key: 'TEACHER_BASE', scope: 'PERSONAL' }, { key: 'TEACHING_OPERATION_MANAGE', scope: 'SCHOOL_WIDE' }, { key: 'TEACHING_EXECUTION_MANAGE', scope: 'SCHOOL_WIDE' }];
async function mocks(page: Page, options: { status?: number; noGrants?: boolean; blocked?: boolean } = {}) {
  const posts: Array<{ url: string; body: unknown }> = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p.endsWith('/auth/me')) return route.fulfill({ json: { user: { id: 'teacher-mock', username: 'teacher', displayName: 'Giáo viên kiểm thử (MOCK)', status: 'ACTIVE', mustChangePassword: false }, capabilities: options.noGrants ? [] : grants } });
    if (route.request().method() === 'POST') {
      posts.push({ url: p, body: route.request().postDataJSON() });
      return route.fulfill({ status: options.status ?? 409, json: { message: 'SQL_INTERNAL CAS_MISMATCH hidden-uuid', error: 'RAW_SERVER_CODE' } });
    }
    if (options.status && !p.includes('/academic-years')) return route.fulfill({ status: options.status, json: { message: 'SQL_INTERNAL hidden-uuid', error: 'RAW_SERVER_CODE' } });
    if (p.endsWith('/effective-schedule/context')) return route.fulfill({ json: context });
    if (p.endsWith('/effective-schedule/teachers')) return route.fulfill({ json: { items: [], total: 0 } });
    if (p.endsWith('/effective-schedule/weekly')) return route.fulfill({ json: { academicYearId: year.id, academicWeekId: 'week-mock', teacherDisplayName: 'Giáo viên kiểm thử', weekLabel: 'Tuần kiểm thử', status: options.blocked ? 'BLOCKED' : 'PASS', blockedReasons: ['SQL_INTERNAL hidden-uuid'], days: [] } });
    if (p.endsWith('/workspace/context')) return route.fulfill({ json: { years: [year], subjects: [], permissions: { teachingSchoolWide: true, calendarSchoolWide: false, teachingSubjectIds: [] } } });
    if (p.endsWith('/historical-teaching/options')) return route.fulfill({ json: { academicYears: [year], selectedAcademicYearId: year.id, classes: [], subjects: [] } });
    if (p.endsWith('/telegram/me')) return route.fulfill({ json: { enabled: true, linked: true } });
    if (p.endsWith('/candidates')) return route.fulfill({ json: { status: 'BLOCKED', items: [], blockedFindings: ['ROOT_BLOCKED:hidden-uuid'] } });
    return route.fulfill({ json: { items: p.endsWith('/academic-years') ? [year] : [], page: 1, pageSize: 50, total: p.endsWith('/academic-years') ? 1 : 0 } });
  });
  return posts;
}

test('P5-058 teacher pages: safe blocked/empty copy, mobile, keyboard and accessibility', async ({ page }) => {
  test.setTimeout(120_000);
  await mocks(page, { blocked: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [route, heading] of [['/lich-day', 'Lịch dạy'], ['/quan-tri/dieu-hanh-chuyen-mon', 'Điều chỉnh hoạt động dạy học'], ['/quan-tri/lich-day-bu', 'Lịch dạy bù'], ['/quan-tri/lich-su-giang-day', 'Nạp lịch sử giảng dạy'], ['/ho-so', 'Giáo viên kiểm thử (MOCK)']]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
    if (route === '/lich-day') await expect(page.getByText(/Hãy liên hệ người phụ trách thời khóa biểu/)).toBeVisible();
    if (route.endsWith('/lich-day-bu')) { await expect(page.getByText(/Có 1 vấn đề cần người phụ trách/)).toBeVisible(); await expect(page.getByText('Chưa có lịch dạy bù nào')).toBeVisible(); }
    await expect(page.locator('main')).not.toContainText(/SQL_INTERNAL|CAS_MISMATCH|hidden-uuid|ROOT_BLOCKED|RAW_SERVER_CODE/);
    for (const width of [320, 375, 414, 1366, 1440]) {
      await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: path.resolve('test-results/p5-058-slice4', `${route.split('/').pop()}-${width}.png`), fullPage: true });
    }
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  }
  await page.goto('/lich-day');
  await page.getByLabel('Phạm vi hiển thị').selectOption('peer-schedule');
  await expect(page.getByText('Không tìm thấy giáo viên phù hợp. Hãy thử tên hoặc mã khác.')).toBeVisible();
  await page.getByLabel('Tìm theo tên hoặc mã').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Danh sách giáo viên')).toBeFocused();
});

for (const status of [401, 403, 409]) {
  test(`P5-058 schedule HTTP ${status}: safe recovery, canonical route`, async ({ page }) => {
    await mocks(page, { status });
    await page.goto('/lich-day');
    if (status === 401) { await expect(page).toHaveURL(/\/dang-nhap$/); await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible(); }
    if (status === 403) await expect(page.getByRole('link', { name: 'Về trang công việc' })).toBeVisible();
    if (status === 409) await expect(page.getByRole('button', { name: 'Tải lại dữ liệu' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/SQL_INTERNAL|hidden-uuid|RAW_SERVER_CODE/);
  });
}

test('P5-058 profile conflict preserves command payload and sends no automatic retry', async ({ page }) => {
  const posts = await mocks(page);
  await page.goto('/ho-so');
  await page.getByRole('button', { name: 'Gửi tin thử', exact: true }).click();
  await expect(page.getByText(/Dữ liệu xung đột/)).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toEqual({ url: '/api/integrations/telegram/test', body: { requestKey: expect.any(String) } });
  await expect(page.locator('main')).not.toContainText(/CAS_MISMATCH|SQL_INTERNAL|hidden-uuid|Gửi tin thử thành công/);
});

test('P5-058 schedule pending and empty are distinct; route guard unchanged', async ({ page }) => {
  await mocks(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/effective-schedule/context', async (route) => { await pending; await route.fulfill({ json: { ...context, weeks: [], currentAcademicWeekId: null } }); });
  await page.goto('/lich-day');
  await expect(page.getByText('Đang tải năm học và tuần học…', { exact: true })).toBeVisible();
  release();
  await expect(page.getByText(/Chưa có tuần học để xem lịch/)).toBeVisible();
  await expect(page.getByLabel('Tuần học', { exact: true })).toBeDisabled();
  await page.unroute('**/api/**');
  await mocks(page, { noGrants: true });
  await page.goto('/lich-day');
  await expect(page).toHaveURL(/\/khong-co-quyen$/);
});
