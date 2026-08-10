import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const screenshots = path.resolve(process.cwd(), 'test-results', 'academic-structure-screenshots');
const auth = { user: { id: 'admin-1', username: 'academic-admin', displayName: 'Quản trị học vụ', status: 'ACTIVE', mustChangePassword: false }, capabilities: [{ key: 'ACADEMIC_STRUCTURE_MANAGE', scope: 'SCHOOL_WIDE' }] };
const year = { id: 'year-1', code: '2026-2027', name: 'Năm học 2026–2027', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };

async function assertAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
  expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
}

async function prepareScreenshot(page: Page) {
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
}

test('academic structure workspace is capability-aware and responsive', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: auth });
    if (url.pathname === '/api/academic-years') return route.fulfill({ json: { items: [year], page: 1, pageSize: 20, total: 1 } });
    if (url.pathname === '/api/academic-years/year-1') return route.fulfill({ json: year });
    if (url.pathname.endsWith('/calendar-versions')) return route.fulfill({ json: { items: [], page: 1, pageSize: 20, total: 0 } });
    return route.fulfill({ status: 404, json: { statusCode: 404, message: 'Không tìm thấy.' } });
  });
  await page.goto('/quan-tri/cau-truc-nam-hoc');
  await expect(page.getByRole('heading', { name: 'Cấu trúc năm học' })).toBeVisible();
  await page.getByRole('link', { name: 'Mở năm học' }).click();
  await expect(page.getByRole('heading', { name: year.name })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lịch năm học' })).toBeVisible();
  await assertAccessible(page);
  await prepareScreenshot(page);
  for (const viewport of [{ width: 375, height: 812 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: path.join(screenshots, `academic-calendar-${viewport.width}x${viewport.height}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Tạo phiên lịch' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(7);
  await expect(page.getByRole('checkbox').first()).not.toBeChecked();
  await page.getByLabel('Số tuần chính thức').fill('2');
  await page.getByLabel('Số tuần dự phòng').fill('1');
  await page.getByRole('button', { name: 'Sinh khung tuần' }).click();
  await expect(page.locator('summary').filter({ hasText: 'Tuần chính thức · thứ tự' })).toHaveCount(2);
  await assertAccessible(page);
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const createButton = page.getByRole('button', { name: 'Tạo phiên lịch' }).first();
    expect((await createButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await prepareScreenshot(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: path.join(screenshots, 'academic-builder-375x812.png'), fullPage: true });
});
