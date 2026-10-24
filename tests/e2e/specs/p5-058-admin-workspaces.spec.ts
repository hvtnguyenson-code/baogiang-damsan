import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const routes = [
  ['/quan-tri/nguoi-dung', 'Người dùng'],
  ['/quan-tri/quyen', 'Cấp quyền'],
  ['/quan-tri/chinh-sach-nghiep-vu', 'Chính sách nghiệp vụ'],
  ['/quan-tri/nhat-ky', 'Nhật ký hệ thống'],
  ['/trang-thai-he-thong', 'Trạng thái hệ thống'],
];
const user = { id: 'target-mock', username: 'teacher-mock', status: 'ACTIVE', profile: { displayName: 'Giáo viên kiểm thử', isTeachingStaff: true } };
const family = { key: 'OPERATIONAL_START', resourceKind: 'ACADEMIC_YEAR', currentValidatorVersion: 'v1', publicationEnabled: true, downstreamAuthority: 'OPERATIONAL_START' };
const paged = (items: unknown[]) => ({ items, page: 1, pageSize: 20, total: items.length });
async function mocks(page: Page, options: { status?: number; empty?: boolean; noGrants?: boolean; gate?: Promise<void> } = {}) {
  const writes: Array<{ url: string; body: unknown }> = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url.endsWith('/auth/me')) return route.fulfill({ json: { user: { id: 'admin-mock', username: 'admin-mock', displayName: 'Quản trị kiểm thử', status: 'ACTIVE', mustChangePassword: false }, capabilities: options.noGrants ? [] : ['USER_MANAGE', 'SYSTEM_ADMIN', 'CAPABILITY_GRANT', 'AUDIT_VIEW', 'BUSINESS_CONFIGURATION_MANAGE'].map((key) => ({ key, scope: 'SCHOOL_WIDE' })) } });
    if (route.request().method() !== 'GET') {
      writes.push({ url, body: route.request().postDataJSON() });
      return route.fulfill({ status: 409, json: { message: 'SQL_INTERNAL secret-host', error: 'RAW_CODE' } });
    }
    if (options.gate) await options.gate;
    if (options.status) return route.fulfill({ status: options.status, json: { message: 'SQL_INTERNAL secret-host', error: 'RAW_CODE' } });
    if (url.includes('/health/live')) return route.fulfill({ json: { status: 'ok', uptime: 120, timestamp: '2026-10-24T00:00:00Z', version: '0.0.1' } });
    if (url.includes('/health/ready')) return route.fulfill({ json: { status: 'ok', timestamp: '2026-10-24T00:00:00Z', checks: { database: { status: 'ok', latencyMs: 5 } } } });
    if (url.endsWith('/families')) return route.fulfill({ json: options.empty ? [] : [family] });
    if (url.endsWith('/delete-preflight')) return route.fulfill({ json: { eligibility: 'ELIGIBLE', username: user.username, blockers: [], cleanupCounts: { staffProfiles: 1, subjectGroupMemberships: 0, staffSubjects: 0 } } });
    if (url.endsWith('/responsibility-templates')) return route.fulfill({ json: { items: [{ key: 'TEACHER', name: 'Giáo viên', version: 'v1', description: 'Quyền cơ sở giáo viên', requiredResourceKind: 'NONE', requiresTeachingStaff: true }] } });
    let items: unknown[] = [];
    if (url.endsWith('/users')) items = [user];
    if (url.endsWith('/capabilities')) items = [{ key: 'TEACHER_BASE', description: 'Công việc giáo viên cơ bản', allowedScopeTypes: ['PERSONAL'], isSystem: false }];
    if (url.endsWith('/audit-events')) items = [{ id: 'event-mock', action: 'CAPABILITY_GRANTED', entityType: 'CapabilityGrant', entityId: 'grant-mock', result: 'SUCCESS', createdAt: '2026-10-24T00:00:00Z', metadata: { capabilityKey: 'TEACHER_BASE' } }];
    return route.fulfill({ json: paged(options.empty ? [] : items) });
  });
  return writes;
}

test('P5-058 admin slice: responsive Vietnamese pages, keyboard, reduced motion and axe', async ({ page }) => {
  test.setTimeout(120_000);
  await mocks(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [index, [route, heading]] of routes.entries()) {
    await page.goto(route!);
    await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
    if (index === 0) {
      await page.getByRole('button', { name: 'Tạo người dùng', exact: true }).click();
      await page.getByLabel('Tên đăng nhập', { exact: true }).focus(); await page.keyboard.press('Tab');
      await expect(page.getByLabel('Mật khẩu khởi tạo', { exact: true })).toBeFocused();
    }
    if (index === 1) await expect(page.getByRole('cell', { name: /Công việc giáo viên cơ bản/ })).toBeVisible();
    if (index === 2) await expect(page.getByRole('button', { name: 'Tạo bản nháp', exact: true })).toBeVisible();
    if (index === 3) await page.getByText('Thông tin bổ sung của sự kiện').click();
    if (index === 4) await expect(page.getByText('Hệ thống hoạt động bình thường')).toBeVisible();
    for (const width of [320, 375, 414, 1366, 1440]) {
      await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: path.resolve('test-results/p5-058-slice6', `page-${index}-${width}.png`), fullPage: true });
    }
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  }
});

for (const status of [401, 403, 409, 500]) test(`P5-058 admin HTTP ${status} remains safe on all five routes`, async ({ page }) => {
  test.setTimeout(120_000);
  await mocks(page, { status });
  for (const [index, [route]] of routes.entries()) {
    await page.goto(route!);
    if (status === 401 && index < 4) await expect(page).toHaveURL(/\/dang-nhap$/);
    else if (status === 401) await expect(page.getByRole('link', { name: 'Đăng nhập lại' })).toBeVisible({ timeout: 15_000 });
    if (status === 403) await expect(page.getByRole('link', { name: 'Về trang công việc' }).first()).toBeVisible({ timeout: 15_000 });
    if (status === 409) await expect(page.getByRole('button', { name: 'Tải lại dữ liệu' }).first()).toBeVisible({ timeout: 15_000 });
    if (status === 500) await expect(page.getByRole('button', { name: 'Thử lại' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText(/SQL_INTERNAL|secret-host|RAW_CODE/);
    await expect(page.getByText('Hệ thống hoạt động bình thường')).toHaveCount(0);
  }
});

test('P5-058 admin loading, empty, missing privileges and public health stay distinct', async ({ page }) => {
  test.setTimeout(90_000);
  for (const [route] of routes.slice(0, 4)) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.unroute('**/api/**'); await mocks(page, { empty: true, gate });
    await page.goto(route!);
    await expect(page.getByRole('status', { name: 'Đang tải dữ liệu' }).first()).toBeVisible();
    release();
    await expect(page.getByText(/Chưa có tài khoản người dùng|Chưa có quyền|Nhật ký chưa có sự kiện|Chưa có nhóm chính sách/).first()).toBeVisible();
    await page.unroute('**/api/**'); await mocks(page, { noGrants: true });
    await page.goto(route!); await expect(page).toHaveURL(/\/khong-co-quyen$/);
  }
  await page.goto('/trang-thai-he-thong');
  await expect(page.getByText('Hệ thống hoạt động bình thường')).toBeVisible();
});

test('P5-058 admin delete conflict retains confirmation and exact command without retry', async ({ page }) => {
  const writes = await mocks(page);
  await page.goto('/quan-tri/nguoi-dung');
  await page.getByRole('button', { name: 'Chọn teacher-mock' }).click();
  await page.getByRole('button', { name: 'Xóa tài khoản an toàn', exact: true }).click();
  const remove = page.getByRole('button', { name: /Xác nhận xóa vĩnh viễn/ });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Nhập tên đăng nhập để xác nhận').fill('teacher-mock');
  await remove.click();
  await expect(page.getByText(/Dữ liệu xung đột/)).toBeVisible();
  await expect(page.getByLabel('Nhập tên đăng nhập để xác nhận')).toHaveValue('teacher-mock');
  expect(writes).toEqual([{ url: '/api/users/target-mock', body: { confirmUsername: 'teacher-mock' } }]);
  await expect(page.locator('body')).not.toContainText(/SQL_INTERNAL|secret-host|RAW_CODE/);
});
