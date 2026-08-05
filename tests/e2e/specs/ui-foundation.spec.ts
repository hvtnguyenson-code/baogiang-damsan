import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const USERNAME = 'e2e-ui-admin';
const INITIAL_PASSWORD = 'E2eUiBootstrapPassword9';
const NEW_PASSWORD = 'E2eUiReplacementPassword8';
const screenshots = 'test-results/ui-foundation';

test.describe.configure({ retries: 0 });

async function prepareScreenshot(page: Page) {
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function assertNoSeriousAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
  expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
}

async function assertResponsiveTargets(page: Page, selectors: string[]) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(overflow, `horizontal overflow at ${await page.evaluate(() => window.innerWidth)}px`).toBe(true);
  for (const selector of selectors) {
    const targets = page.locator(selector);
    const count = await targets.count();
    expect(count, `missing target ${selector}`).toBeGreaterThan(0);
    let visibleCount = 0;
    for (let index = 0; index < count; index += 1) {
      const target = targets.nth(index);
      if (!(await target.isVisible())) continue;
      visibleCount += 1;
      const box = await target.boundingBox();
      expect(box, `missing target ${selector}[${index}]`).not.toBeNull();
      expect(box!.height, `${selector}[${index}] height`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${selector}[${index}] width`).toBeGreaterThanOrEqual(44);
    }
    expect(visibleCount, `no visible targets for ${selector}`).toBeGreaterThan(0);
  }
}

async function assertAtMobileWidths(page: Page, selectors: string[]) {
  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 812 });
    await assertResponsiveTargets(page, selectors);
  }
}

test('public system status is usable and exposes only safe recovery details', async ({ page }) => {
  await page.goto('/trang-thai-he-thong');
  await expect(page.getByRole('heading', { name: 'Trạng thái hệ thống' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải lại trạng thái' })).toBeVisible();
  await expect(page.getByText('API', { exact: true })).toBeVisible();
  await expect(page.getByText('Cơ sở dữ liệu', { exact: true })).toBeVisible();
  await prepareScreenshot(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: `${screenshots}/system-status-ready-1366x768.png` });

  await page.route('**/api/health/**', (route) => route.abort('failed'));
  await page.reload();
  await expect(page.getByText('Không thể kết nối', { exact: true })).toBeVisible();
  await expect(page.getByText(/stack|postgresql:\/\//i)).toHaveCount(0);
  await prepareScreenshot(page);
  await page.screenshot({ path: `${screenshots}/system-status-error-safe-1366x768.png` });
});

test('real auth UI supports keyboard, first-login change, cookie reload, and logout', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/dang-nhap$/);
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await assertNoSeriousAxeViolations(page);
  await assertAtMobileWidths(page, ['button[type="submit"]', 'a[href="/trang-thai-he-thong"]']);
  await page.setViewportSize({ width: 1366, height: 768 });

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Đến biểu mẫu' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.auth-context a[href="/trang-thai-he-thong"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Tên đăng nhập')).toBeFocused();

  await prepareScreenshot(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: `${screenshots}/login-375x812.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: `${screenshots}/login-1366x768.png` });

  await page.getByLabel('Tên đăng nhập').fill(USERNAME);
  await page.getByLabel('Mật khẩu').fill('wrong-password');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Tên đăng nhập hoặc mật khẩu không hợp lệ.')).toBeVisible();
  await expect(page.getByText(USERNAME)).toHaveCount(0);
  await expect(page.getByLabel('Mật khẩu')).toHaveValue('');

  await page.getByLabel('Mật khẩu').fill(INITIAL_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/doi-mat-khau-lan-dau$/);
  await expect(page.getByRole('heading', { name: 'Đổi mật khẩu để tiếp tục' })).toBeVisible();
  await assertNoSeriousAxeViolations(page);
  await expect(page.getByLabel('Mật khẩu hiện tại')).toHaveValue('');
  await prepareScreenshot(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: `${screenshots}/first-password-change-375x812.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: `${screenshots}/first-password-change-1366x768.png` });
  await assertAtMobileWidths(page, ['button[type="submit"]', 'button[type="button"]']);

  await page.route('**/api/auth/logout', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Đăng xuất khỏi lần đăng nhập đầu tiên', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đổi mật khẩu để tiếp tục' })).toBeVisible();
  await page.unroute('**/api/auth/logout');

  await page.getByLabel('Mật khẩu hiện tại').fill(INITIAL_PASSWORD);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('too-short');
  await page.getByLabel('Xác nhận mật khẩu mới').fill('not-the-same');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByText(/ít nhất 12 ký tự, có chữ thường, chữ hoa và chữ số/).last()).toBeVisible();
  await expect(page.getByText('Mật khẩu xác nhận chưa khớp.')).toBeVisible();

  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Xác nhận mật khẩu mới').fill(NEW_PASSWORD);
  const changeResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/auth/change-password'
      && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  const changeResponse = await changeResponsePromise;
  expect(changeResponse.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: /E2E UI Admin/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' }).locator('[role="tab"]')).toHaveCount(0);
  await expect(page.locator('select[id*="role"], [id*="role"][role="combobox"]')).toHaveCount(0);
  await assertNoSeriousAxeViolations(page);
  await prepareScreenshot(page);
  for (const viewport of [{ width: 375, height: 812 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: `${screenshots}/workspace-${viewport.width}x${viewport.height}.png` });
  }
  await assertAtMobileWidths(page, ['.session-context .button', '.primary-nav a']);

  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /E2E UI Admin/ })).toBeVisible();
  await page.route('**/api/auth/logout', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ statusCode: 503, message: 'temporary internal detail' }),
  }));
  await page.getByRole('button', { name: 'Đăng xuất khỏi không gian làm việc', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: /E2E UI Admin/ })).toBeVisible();
  await page.unroute('**/api/auth/logout');
  await page.getByRole('button', { name: 'Đăng xuất khỏi không gian làm việc', exact: true }).click();
  await expect(page).toHaveURL(/\/dang-nhap$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/dang-nhap$/);
});
