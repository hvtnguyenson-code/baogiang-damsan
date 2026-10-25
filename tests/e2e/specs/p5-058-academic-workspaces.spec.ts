import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const year = { id: 'year-mock', code: '2026-2027', name: 'Năm học kiểm thử (MOCK)', updatedAt: '2026-09-01T00:00:00Z' };
const calendar = { id: 'calendar-mock', versionNumber: 1, startDate: '2026-08-31', endDate: '2027-05-31', officialWeekCount: 1, reserveWeekCount: 0, teachingWeekdays: ['MONDAY'], isActive: false, activatedAt: null, note: null };
const schoolClass = { id: 'class-mock', code: '10A1', name: 'Lớp 10A1', gradeLevel: 10, status: 'ACTIVE' };
const teacher = { userId: 'teacher-mock', displayName: 'Giáo viên kiểm thử', username: 'mock-teacher', staffCode: 'GV01', userStatus: 'DISABLED', isTeachingStaff: false };
const subject = { id: 'subject-mock', code: 'TOAN', name: 'Toán', status: 'ACTIVE' };
const row = { id: 'assignment-mock', academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: teacher.userId, schoolClass, subject, teacher, validFrom: '2026-08-31', validUntil: '2026-09-10', status: 'ACTIVE', note: null, entryReason: null, replacesId: 'trace-source-mock', reversalReason: null, reversedAt: null, reversedByUserId: null };
const routes = [
  ['/quan-tri/cau-truc-nam-hoc', 'Cấu trúc năm học'],
  [`/quan-tri/cau-truc-nam-hoc/${year.id}/lich`, year.name],
  [`/quan-tri/cau-truc-nam-hoc/${year.id}/lop`, year.name],
  ['/quan-tri/phan-cong-giang-day', 'Phân công giảng dạy'],
  ['/quan-tri/phan-cong-chu-nhiem', 'Phân công chủ nhiệm'],
];
async function mocks(page: Page, options: { status?: number; empty?: boolean; noGrants?: boolean; gate?: Promise<void> } = {}) {
  const posts: Array<{ url: string; body: unknown }> = [];
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith('/auth/me')) return route.fulfill({ json: { user: { id: 'admin-mock', username: 'mock', displayName: 'Quản trị kiểm thử', status: 'ACTIVE', mustChangePassword: false }, capabilities: options.noGrants ? [] : ['ACADEMIC_STRUCTURE_MANAGE', 'SUBJECT_MANAGE', 'HOMEROOM_ASSIGNMENT_MANAGE'].map((key) => ({ key, scope: 'SCHOOL_WIDE' })) } });
    if (route.request().method() === 'POST') {
      posts.push({ url: p, body: route.request().postDataJSON() });
      return route.fulfill({ status: 409, json: { message: 'SQL_INTERNAL CAS_MISMATCH secret-host' } });
    }
    if (options.gate) await options.gate;
    if (options.status) return route.fulfill({ status: options.status, json: { message: 'SQL_INTERNAL secret-host', error: 'RAW_CODE' } });
    if (p.endsWith(`/academic-years/${year.id}`)) {
      if (p.includes('-options/')) return route.fulfill({ json: { academicYear: year, businessDate: '2026-09-04', activeCalendar: calendar, classes: [schoolClass], subjects: [subject], historicalTeachers: [teacher] } });
      return route.fulfill({ json: year });
    }
    let items: unknown[] = [];
    if (p.endsWith('/academic-years')) items = [year];
    if (p.endsWith('/calendar-versions')) items = [calendar];
    if (p.endsWith('/classes')) items = [schoolClass];
    if (p.endsWith('/teaching-assignments') || p.endsWith('/homeroom-assignments')) items = [row];
    if (p.endsWith('/eligible-teachers')) items = [teacher];
    if (options.empty) items = [];
    return route.fulfill({ json: { items, page: 1, pageSize: 20, total: items.length } });
  });
  return posts;
}

test('P5-058 academic slice: five pages, forms, trace, keyboard, responsive and axe', async ({ page }) => {
  test.setTimeout(120_000);
  await mocks(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [index, [route, heading]] of routes.entries()) {
    await page.goto(route!);
    await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
    if (index === 0) {
      await page.getByRole('button', { name: 'Tạo năm học', exact: true }).click();
      await page.getByLabel('Mã năm học').focus(); await page.keyboard.press('Tab');
      await expect(page.getByLabel('Tên năm học')).toBeFocused();
    }
    if (index === 1) {
      await expect(page.getByText('Không áp dụng', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Tạo phiên lịch', exact: true }).click();
    }
    if (index === 2) await page.getByRole('button', { name: 'Tạo lớp', exact: true }).click();
    if (index === 3 || index === 4) {
      if (index === 4) {
        await expect(page.getByText(/Tài khoản hiện tại.*Đã vô hiệu hóa/)).toBeVisible();
        await expect(page.getByText('Thay thế: trace-source-mock')).not.toBeVisible();
        await page.getByText('Thông tin kỹ thuật để tra cứu', { exact: true }).click();
        await expect(page.getByText('Thay thế: trace-source-mock')).toBeVisible();
        await page.getByText('Thông tin kỹ thuật để tra cứu', { exact: true }).click();
      }
      for (const action of ['Kết thúc', 'Đổi giáo viên', ...(index === 4 ? ['Hiệu chỉnh'] : [])]) {
        await page.getByRole('button', { name: action, exact: true }).click();
        await expect(page.locator('form')).toBeVisible();
        await page.getByRole('button', { name: 'Hủy', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Tạo phân công', exact: true }).click();
      await expect(page.locator('form').getByRole('combobox', { name: index === 3 ? 'Giáo viên' : 'Giáo viên đủ điều kiện', exact: true })).toBeDisabled();
    }
    for (const width of [320, 375, 414, 1366, 1440]) {
      await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: path.resolve('test-results/p5-058-slice5', `page-${index}-${width}.png`), fullPage: true });
    }
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  }
});

for (const status of [401, 403, 409]) test(`P5-058 academic HTTP ${status} on five routes`, async ({ page }) => {
  test.setTimeout(120_000);
  await mocks(page, { status });
  for (const [route] of routes) {
    await page.goto(route!);
    if (status === 401) await expect(page).toHaveURL(/\/dang-nhap$/);
    // These live QueryClient queries retain their existing bounded read retries.
    if (status === 403) await expect(page.getByRole('link', { name: 'Về trang công việc' })).toBeVisible({ timeout: 15_000 });
    if (status === 409) await expect(page.getByRole('button', { name: 'Tải lại dữ liệu' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText(/SQL_INTERNAL|secret-host|RAW_CODE/);
  }
});

test('P5-058 academic pending, empty and denied routes remain distinct', async ({ page }) => {
  test.setTimeout(60_000);
  for (const [route] of routes) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.unroute('**/api/**'); await mocks(page, { empty: true, gate });
    await page.goto(route!);
    await expect(page.getByRole('status', { name: 'Đang tải dữ liệu' }).first()).toBeVisible();
    release();
    await expect(page.locator('main').getByRole('heading').filter({ hasText: /Chưa có/ })).toBeVisible();
    await page.unroute('**/api/**'); await mocks(page, { noGrants: true });
    await page.goto(route!); await expect(page).toHaveURL(/\/khong-co-quyen$/);
  }
});

test('P5-058 year create and calendar activation conflicts preserve commands without retry', async ({ page }) => {
  const posts = await mocks(page);
  await page.goto(routes[0]![0]!);
  await page.getByRole('button', { name: 'Tạo năm học', exact: true }).click();
  await page.getByLabel('Mã năm học').fill(' nh26 '); await page.getByLabel('Tên năm học').fill(' Năm học mới ');
  await page.getByRole('button', { name: 'Lưu năm học', exact: true }).click();
  await expect(page.getByText(/Dữ liệu xung đột/)).toBeVisible();
  await expect(page.getByLabel('Tên năm học')).toHaveValue(' Năm học mới ');
  expect(posts).toEqual([{ url: '/api/academic-years', body: { code: 'NH26', name: 'Năm học mới' } }]);
  await page.goto(routes[1]![0]!);
  await page.getByRole('button', { name: 'Kích hoạt Phiên 1', exact: true }).click();
  expect(posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Xác nhận kích hoạt Phiên 1', exact: true }).click();
  await expect(page.getByText(/Dữ liệu xung đột/)).toBeVisible();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual({ url: '/api/academic-calendar-versions/calendar-mock/activate', body: {} });
  await expect(page.locator('main')).not.toContainText(/SQL_INTERNAL|CAS_MISMATCH|secret-host/);
});
