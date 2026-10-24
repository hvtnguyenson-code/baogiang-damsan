import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Browser-only mock evidence; no backend or production data is used.
test('P5-058: import query survives refresh/back; localized recovery across viewports', async ({ page }) => {
  let failYears = false;
  let writes = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') writes++;
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') {
      return route.fulfill({ json: {
        user: { id: 'mock-manager', username: 'manager', displayName: 'Người quản lý (MOCK)', status: 'ACTIVE', mustChangePassword: false },
        capabilities: [{ key: 'TIMETABLE_MANAGE', scope: 'SCHOOL_WIDE' }],
      } });
    }
    if (url.pathname === '/api/academic-years') {
      return failYears
        ? route.fulfill({ status: 500, json: { message: 'READY Forbidden SQL_INTERNAL_CODE', error: 'SECRET_TECHNICAL_CODE' } })
        : route.fulfill({ json: { items: [{ id: 'mock-year', code: '2026-2027', name: 'Năm học 2026-2027' }], total: 1 } });
    }
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/quan-tri/thoi-khoa-bieu?tab=import');
  await expect(page.getByLabel(/Tệp Excel Thời khóa biểu/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Tệp Excel Thời khóa biểu/)).toBeVisible();
  const versions = page.getByRole('button', { name: 'Phiên bản TKB', exact: true });
  await versions.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Chưa có phiên bản thời khóa biểu nào' })).toBeVisible();
  await expect(page).not.toHaveURL(/tab=import/);
  await page.goBack();
  await expect(page.getByLabel(/Tệp Excel Thời khóa biểu/)).toBeVisible();
  expect(writes).toBe(0);

  for (const width of [320, 375, 414, 1366, 1440]) {
    await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.resolve('test-results/p5-058', `import-${width}.png`), fullPage: true });
  }

  failYears = true;
  await page.reload();
  const retry = page.getByRole('button', { name: 'Thử lại', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('alert')).not.toContainText(/READY|Forbidden|SQL_INTERNAL_CODE|SECRET_TECHNICAL_CODE/);
  for (const width of [320, 375, 414, 1366, 1440]) {
    await page.setViewportSize({ width, height: width >= 1366 ? 768 : 896 });
    await page.screenshot({ path: path.resolve('test-results/p5-058', `error-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const bounds = await retry.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
  }
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  failYears = false;
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel(/Tệp Excel Thời khóa biểu/)).toBeVisible();
  expect(writes).toBe(0);
});
