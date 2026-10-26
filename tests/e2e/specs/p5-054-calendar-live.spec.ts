import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The isolated PostgreSQL integration harness starts the real Nest application
// and supplies test accounts. The route below is an HTTP proxy, not a fixture or
// a mocked API response. Standalone runs cannot claim this acceptance evidence.
const backend = process.env['P5054_API_URL'];
test.skip(!backend, 'Requires P5-054 isolated PostgreSQL + real API harness.');

test('P5-054 live calendar: retained credit, school cancellation, reversal, blocked fulfillment, stale preview and denied grant', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${backend}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  async function capture(name: string) {
    for (const width of [320, 375, 414, 1366, 1440]) {
      await page.setViewportSize({ width, height: width > 1000 ? 768 : 896 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: path.resolve(`test-results/p5-054-live/${name}-${width}.png`), fullPage: true });
    }
  }
  await page.goto('/dang-nhap');
  await page.getByLabel('Tên đăng nhập').fill(process.env['P5054_TEST_USERNAME']!);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Phase01BackendPassword9');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/dang-nhap$/);
  await page.goto('/quan-tri/dieu-hanh-chuyen-mon');
  await page.getByLabel('Ngày dạy', { exact: true }).fill('2026-08-17');
  await page.getByRole('button', { name: 'Xem tiết dạy gốc', exact: true }).click();
  await page.getByLabel('Lý do ngoại lệ').fill('Nghỉ toàn trường theo quyết định kiểm thử');
  await page.getByRole('button', { name: 'Xem trước số tiết bị ảnh hưởng', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hệ quả đã đối soát' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Khối lượng chính thức trước và sau' })).toContainText('1 → 1');
  await expect(page.getByRole('region', { name: 'Khối lượng chính thức trước và sau' })).toContainText('63 → 63');
  for (const width of [320, 375, 414, 1366, 1440]) {
    await page.setViewportSize({ width, height: width > 1000 ? 768 : 896 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.resolve(`test-results/p5-054-live/calendar-${width}.png`), fullPage: true });
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.getByRole('button', { name: 'Xác nhận ngoại lệ lịch', exact: true }).focus();
  await expect(page.getByRole('button', { name: 'Xác nhận ngoại lệ lịch', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Đã tạo ngoại lệ lịch/)).toBeVisible();
  await page.getByRole('button', { name: 'Tải lịch sử điều hành', exact: true }).click();
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await page.getByLabel('Lý do hoàn tác (ít nhất 5 ký tự)').fill('Khôi phục lịch sau khi kiểm tra');
  await page.getByRole('button', { name: 'Xác nhận hoàn tác', exact: true }).click();
  await expect(page.getByText('Đã hoàn tác', { exact: true })).toBeVisible();

  await page.getByLabel('Ngày dạy', { exact: true }).fill('2026-08-10');
  await page.getByRole('button', { name: 'Xem tiết dạy gốc', exact: true }).click();
  await page.getByRole('button', { name: 'Xem trước số tiết bị ảnh hưởng', exact: true }).click();
  await expect(page.getByText('Ngoại lệ không đủ điều kiện', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận ngoại lệ lịch', exact: true })).toHaveCount(0);

  await page.getByLabel('Ngày dạy', { exact: true }).fill('2026-08-31');
  await page.getByRole('button', { name: 'Xem tiết dạy gốc', exact: true }).click();
  await page.getByRole('button', { name: 'Xem trước số tiết bị ảnh hưởng', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xác nhận ngoại lệ lịch', exact: true })).toBeEnabled();
  const normal = JSON.parse(process.env['P5054_NORMAL_JSON']!);
  const created = await page.request.post(`${backend}/api/teaching-executions/curricular/normal`, {
    headers: { Origin: 'http://127.0.0.1:5173' }, data: { ...normal, requestKey: crypto.randomUUID() },
  });
  expect(created.status()).toBe(201);
  const rejected = page.waitForResponse((r) => r.url().endsWith('/calendar-exceptions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Xác nhận ngoại lệ lịch', exact: true }).click();
  expect((await rejected).status()).toBe(409);
  await expect(page.getByRole('button', { name: 'Xác nhận ngoại lệ lịch', exact: true })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/RECONCILIATION_REQUIRED|CALENDAR_REPLAY_|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}/);

  const denied = await browser.newContext();
  const other = await denied.newPage();
  try {
    await other.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({ response: await route.fetch({ url: `${backend}${url.pathname}${url.search}` }) });
    });
    await other.goto('/dang-nhap');
    await other.getByLabel('Tên đăng nhập').fill(process.env['P5054_DENIED_USERNAME']!);
    await other.getByLabel('Mật khẩu', { exact: true }).fill('Phase01BackendPassword9');
    await other.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(other).not.toHaveURL(/\/dang-nhap$/);
    await other.goto('/quan-tri/dieu-hanh-chuyen-mon');
    await expect(other.getByRole('button', { name: 'Xem tiết dạy gốc', exact: true })).toHaveCount(0);
    const response = await other.request.post(`${backend}/api/operational-overlays/workspace/calendar-preview`, {
      headers: { Origin: 'http://127.0.0.1:5173' }, data: JSON.parse(process.env['P5054_CALENDAR_JSON']!),
    });
    expect(response.status()).toBe(403);
  } finally { await other.unrouteAll({ behavior: 'wait' }); await denied.close(); }

  async function selectSource10B() {
    await page.getByLabel('Ngày dạy', { exact: true }).fill('2026-08-10');
    await page.getByRole('button', { name: 'Xem tiết dạy gốc', exact: true }).click();
    const select = page.getByLabel('Tiết học gốc', { exact: true });
    const value = await select.getByRole('option').filter({ hasText: '10B' }).getAttribute('value');
    await select.selectOption(value!);
    await page.getByLabel('Ghi chú, lý do').fill('Điều hành trên nguồn đã xác minh');
    return select;
  }
  await selectSource10B();
  await page.getByLabel('Phương án xử lý').selectOption('SAME_SUBJECT_SUBSTITUTION');
  await page.getByRole('button', { name: 'Tìm giáo viên có thể lựa chọn', exact: true }).click();
  await page.getByLabel('Giáo viên dự kiến').selectOption({ label: 'Giáo viên kiểm thử thay thế' });
  await page.getByRole('button', { name: 'Xem trước phân công xử lý', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xác nhận điều hành tiết dạy', exact: true })).toBeEnabled();
  await capture('same-subject');
  const sameSubjectWrite = page.waitForResponse((r) => r.url().endsWith('/lesson-dispositions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Xác nhận điều hành tiết dạy', exact: true }).click();
  expect((await sameSubjectWrite).status()).toBe(201);
  await expect(page.getByText('Đã ghi nhận phân công xử lý. Tải lịch sử để kiểm tra bản ghi vừa tạo.')).toBeVisible();
  await page.getByRole('button', { name: 'Tải lịch sử điều hành', exact: true }).click();
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await page.getByLabel('Lý do hoàn tác (ít nhất 5 ký tự)').fill('Đổi từ dạy thay sang giám sát sau kiểm tra');
  await page.getByRole('button', { name: 'Xác nhận hoàn tác', exact: true }).click();
  await expect(page.getByText('Đã ghi nhận hoàn tác. Lịch sử được giữ nguyên.')).toBeVisible();

  await selectSource10B();
  await page.getByLabel('Phương án xử lý').selectOption('SAME_SUBJECT_SUBSTITUTION');
  await page.getByRole('button', { name: 'Tìm giáo viên có thể lựa chọn', exact: true }).click();
  await page.getByLabel('Giáo viên dự kiến').selectOption({ label: 'Cán bộ điều hành kiểm thử' });
  await page.getByRole('button', { name: 'Xem trước phân công xử lý', exact: true }).click();
  await expect(page.getByText('Không đủ điều kiện điều hành', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận điều hành tiết dạy', exact: true })).toHaveCount(0);

  await page.getByLabel('Phương án xử lý').selectOption('DIFFERENT_SUBJECT_SUPERVISION');
  await page.getByRole('button', { name: 'Tìm giáo viên có thể lựa chọn', exact: true }).click();
  await page.getByLabel('Giáo viên dự kiến').selectOption({ label: 'Giáo viên kiểm thử thay thế' });
  await page.getByRole('button', { name: 'Xem trước phân công xử lý', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xác nhận điều hành tiết dạy', exact: true })).toBeEnabled();
  await capture('supervision');
  const supervisionWrite = page.waitForResponse((r) => r.url().endsWith('/lesson-dispositions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Xác nhận điều hành tiết dạy', exact: true }).click();
  expect((await supervisionWrite).status()).toBe(201);
  await expect(page.getByText('Đã ghi nhận phân công xử lý. Tải lịch sử để kiểm tra bản ghi vừa tạo.')).toBeVisible();

  await page.goto('/quan-tri/lich-day-bu');
  await page.getByRole('button', { name: 'Lập lịch bù', exact: true }).click();
  async function selectTarget(date: string) {
    await page.getByLabel('Ngày dạy bù dự kiến', { exact: true }).fill(date);
    await page.getByLabel('Giáo viên thực hiện', { exact: true }).selectOption({ label: 'Giáo viên kiểm thử thay thế' });
    await expect(page.getByRole('button', { name: 'Xác nhận tạo lịch dạy bù', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Xem trước hệ quả dạy bù', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Xác nhận tạo lịch dạy bù', exact: true })).toBeEnabled();
    if (date === '2026-08-18') {
      await capture('makeup');
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(accessibility.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    }
    await page.getByRole('button', { name: 'Xác nhận tạo lịch dạy bù', exact: true }).click();
    await expect(page.getByText(/Lập lịch dạy bù thành công/)).toBeVisible();
  }
  await selectTarget('2026-08-18');
  await page.getByRole('button', { name: 'Đảo lịch', exact: true }).click();
  await page.getByLabel('Lý do đảo lịch dạy bù').fill('Chọn lại ngày dạy bù phù hợp');
  await page.getByRole('button', { name: 'Xác nhận đảo', exact: true }).click();
  await expect(page.getByText('Đã hoàn tác lịch dạy bù.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tạo lịch thay thế', exact: true }).click();
  await selectTarget('2026-08-25');
  await expect(page.getByRole('button', { name: 'Tải lại danh sách', exact: true })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Danh sách lịch dạy bù' })).toContainText('Đang hiệu lực');
  // Drain the real HTTP proxy before Playwright disposes its request context.
  await page.unrouteAll({ behavior: 'wait' });
});
