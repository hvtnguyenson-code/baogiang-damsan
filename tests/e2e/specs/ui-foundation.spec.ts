import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

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

async function selectOptionMatching(select: Locator, pattern: RegExp) {
  const matchingOptions = select.locator('option').filter({ hasText: pattern });

  await expect(
    matchingOptions,
    `Expected exactly one selectable option matching ${pattern}`,
  ).toHaveCount(1);

  const value = await matchingOptions.getAttribute('value');
  if (!value) throw new Error(`Option matching ${pattern} has no selectable value.`);

  await select.selectOption(value);
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
  await expect(page.getByRole('alert')).toHaveCount(0);
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

test('real Phase 01 management flow preserves history and capability boundaries', async ({ page }) => {
  const targetUsername = 'e2e-phase01-target';
  const targetInitialPassword = 'E2eTargetPassword7';
  const targetNewPassword = 'E2eTargetReplacement8';

  await page.goto('/quan-tri/nguoi-dung');
  await expect(page).toHaveURL(/\/dang-nhap$/);
  await page.getByLabel('Tên đăng nhập').fill(USERNAME);
  await page.getByLabel('Mật khẩu').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/quan-tri\/nguoi-dung$/);
  await expect(page.getByRole('heading', { name: 'Người dùng' })).toBeVisible();
  await assertNoSeriousAxeViolations(page);

  await page.getByRole('button', { name: 'Tạo người dùng' }).click();
  await page.getByLabel('Tên đăng nhập').fill(targetUsername);
  await page.getByLabel('Mật khẩu khởi tạo').fill(targetInitialPassword);
  await page.getByLabel('Mã nhân sự').fill('E2E-GV-01');
  await page.getByLabel('Tên hiển thị').fill('Giáo viên E2E Phase 01');
  await page.getByLabel('Email').fill('e2e-phase01@example.invalid');
  await page.getByLabel('Chức danh').fill('Giáo viên');
  await page.locator('form.long-form').getByRole('button', { name: 'Tạo người dùng' }).click();
  const targetRow = page.locator('tbody tr', { hasText: targetUsername });
  await expect(targetRow).toBeVisible();
  await targetRow.getByRole('button', { name: 'Kích hoạt' }).click();
  await targetRow.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(targetRow.getByText('Đang hoạt động')).toBeVisible();
  await prepareScreenshot(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: `${screenshots}/management-users-1366x768.png` });
  await page.getByRole('button', { name: 'Tạo người dùng' }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: `${screenshots}/management-user-form-375x812.png`, fullPage: true });
  await page.locator('form.long-form').getByRole('button', { name: 'Hủy' }).click();

  await page.goto('/quan-tri/to-chuyen-mon');
  await page.getByRole('button', { name: 'Thêm tổ' }).click();
  await page.getByLabel('Mã').fill('E2ETO');
  await page.getByLabel('Tên').fill('Tổ E2E Phase 01');
  await page.locator('form').getByRole('button', { name: 'Thêm vào danh mục' }).click();
  await expect(page.getByRole('status').getByText('Đã lưu danh mục.', { exact: true })).toBeVisible();
  const groupRow = page.locator('tbody tr', { hasText: 'E2ETO' });
  await expect(groupRow.getByText('Tổ E2E Phase 01', { exact: true })).toBeVisible();
  await groupRow.getByRole('button', { name: 'Sửa E2ETO' }).click();
  await page.getByLabel('Tên').fill('Tổ E2E Phase 01 đã sửa');
  await page.locator('form').getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByRole('status').getByText('Đã lưu danh mục.', { exact: true })).toBeVisible();
  await expect(groupRow.getByText('Tổ E2E Phase 01 đã sửa', { exact: true })).toBeVisible();

  await page.goto('/quan-tri/mon-hoc');
  await page.getByRole('button', { name: 'Thêm môn' }).click();
  await page.getByLabel('Mã').fill('E2EMON');
  await page.getByLabel('Tên').fill('Môn E2E Phase 01');
  await page.locator('form').getByRole('button', { name: 'Thêm vào danh mục' }).click();
  await expect(page.getByRole('status').getByText('Đã lưu danh mục.', { exact: true })).toBeVisible();
  const subjectRow = page.locator('tbody tr', { hasText: 'E2EMON' });
  await expect(subjectRow.getByText('Môn E2E Phase 01', { exact: true })).toBeVisible();

  await page.goto('/quan-tri/phan-cong-to');
  await page.getByRole('button', { name: 'Tạo phân công' }).click();
  const membershipForm = page.locator('form.inline-work-form');
  await selectOptionMatching(membershipForm.getByLabel('Người được phân công'), /Giáo viên E2E Phase 01/);
  await selectOptionMatching(membershipForm.getByLabel('Tổ chuyên môn'), /E2ETO/);
  await membershipForm.getByRole('checkbox', { name: 'Phân công chính' }).check();
  await membershipForm.getByRole('button', { name: 'Lưu phân công' }).click();
  await expect(page.getByRole('status').getByText('Đã lưu phân công.', { exact: true })).toBeVisible();
  const membershipRow = page.locator('tbody tr', { hasText: 'Giáo viên E2E Phase 01' }).filter({ hasText: 'E2ETO' });
  await expect(membershipRow).toBeVisible();
  await expect(membershipRow.getByText(/E2ETO — Tổ E2E Phase 01 đã sửa/)).toBeVisible();

  await page.goto('/quan-tri/phan-cong-mon');
  await page.getByRole('button', { name: 'Tạo phân công' }).click();
  const staffSubjectForm = page.locator('form.inline-work-form');
  await selectOptionMatching(staffSubjectForm.getByLabel('Người được phân công'), /Giáo viên E2E Phase 01/);
  await selectOptionMatching(staffSubjectForm.getByLabel('Môn học'), /E2EMON/);
  await staffSubjectForm.getByRole('button', { name: 'Lưu phân công' }).click();
  await expect(page.getByRole('status').getByText('Đã lưu phân công.', { exact: true })).toBeVisible();
  const staffSubjectRow = page.locator('tbody tr', { hasText: 'Giáo viên E2E Phase 01' }).filter({ hasText: 'E2EMON' });
  await expect(staffSubjectRow).toBeVisible();
  await expect(staffSubjectRow.getByText(/E2EMON — Môn E2E Phase 01/)).toBeVisible();
  await assertNoSeriousAxeViolations(page);
  await prepareScreenshot(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: `${screenshots}/management-assignment-1366x768.png` });

  await page.goto('/quan-tri/quyen');
  const capabilityForm = page.locator('section.inline-work-form form');
  await selectOptionMatching(capabilityForm.getByLabel('Người nhận'), /Giáo viên E2E Phase 01/);
  await capabilityForm.getByLabel('Quyền').selectOption('TEACHER_BASE');
  await capabilityForm.getByLabel('Phạm vi').selectOption('PERSONAL');
  await capabilityForm.getByRole('button', { name: 'Cấp quyền' }).click();
  await expect(page.getByRole('status').getByText('Đã cấp quyền.', { exact: true })).toBeVisible();
  const capabilityHistory = page.locator('section[aria-labelledby="history-heading"]');
  await expect(capabilityHistory.getByRole('heading', { name: /Lịch sử quyền của Giáo viên E2E Phase 01/ })).toBeVisible();
  const capabilityRow = capabilityHistory.locator('tbody tr', { hasText: 'Công việc giáo viên cơ bản' });
  await expect(capabilityRow).toBeVisible();
  await expect(capabilityRow.getByText('Công việc giáo viên cơ bản', { exact: true })).toBeVisible();
  await prepareScreenshot(page);
  await page.screenshot({ path: `${screenshots}/management-capabilities-1366x768.png`, fullPage: true });

  await page.goto('/quan-tri/kiem-nhiem/danh-muc');
  await page.getByRole('button', { name: 'Thêm loại kiêm nhiệm' }).click();
  const dutyDefinitionForm = page.locator('form.long-form');
  await expect(dutyDefinitionForm.getByRole('heading', { name: 'Thêm loại kiêm nhiệm' })).toBeVisible();
  await dutyDefinitionForm.getByLabel('Mã', { exact: true }).fill('E2EDUTY');
  await dutyDefinitionForm.getByLabel('Tên', { exact: true }).fill('Kiêm nhiệm E2E Phase 01');
  await dutyDefinitionForm.getByLabel('Nhóm', { exact: true }).fill('Kiểm thử');
  await dutyDefinitionForm.getByRole('button', { name: 'Lưu loại kiêm nhiệm', exact: true }).click();
  await expect(page.getByRole('status').getByText('Đã lưu loại kiêm nhiệm.', { exact: true })).toBeVisible();
  const createdDutyDefinitionRow = page.locator('tbody tr', { hasText: 'E2EDUTY' });
  await expect(createdDutyDefinitionRow.getByText('Kiêm nhiệm E2E Phase 01', { exact: true })).toBeVisible();

  await page.goto('/quan-tri/kiem-nhiem/phan-cong');
  await page.getByRole('button', { name: 'Tạo phân công' }).click();
  const dutyForm = page.locator('form.long-form');
  await selectOptionMatching(dutyForm.getByLabel('Nhân sự', { exact: true }), /Giáo viên E2E Phase 01/);
  await selectOptionMatching(dutyForm.getByLabel('Loại kiêm nhiệm', { exact: true }), /E2EDUTY/);
  await dutyForm.getByLabel('Phạm vi', { exact: true }).selectOption('SCHOOL_WIDE');
  await dutyForm.getByLabel('Ghi chú', { exact: true }).fill('Phân công kiểm thử giao diện');
  await dutyForm.getByRole('button', { name: 'Lưu phân công', exact: true }).click();
  await expect(page.getByRole('status').getByText('Đã lưu phân công kiêm nhiệm.', { exact: true })).toBeVisible();
  const dutyRow = page.locator('tbody tr', { hasText: 'Kiêm nhiệm E2E Phase 01' });
  await expect(dutyRow).toBeVisible();
  await dutyRow.getByRole('button', { name: 'Sửa hiệu lực' }).click();
  await dutyForm.getByLabel('Ghi chú', { exact: true }).fill('Đã cập nhật trong kiểm thử');
  await dutyForm.getByRole('button', { name: 'Lưu phân công', exact: true }).click();
  await expect(page.getByRole('status').getByText('Đã lưu phân công kiêm nhiệm.', { exact: true })).toBeVisible();
  await expect(dutyRow.getByText('Đã cập nhật trong kiểm thử')).toBeVisible();
  await dutyRow.getByRole('button', { name: 'Kết thúc' }).click();
  await dutyRow.getByRole('button', { name: 'Xác nhận kết thúc' }).click();
  await expect(page.getByRole('status').getByText('Đã kết thúc phân công; lịch sử vẫn được giữ.', { exact: true })).toBeVisible();
  await expect(dutyRow.getByText('Đã kết thúc')).toBeVisible();
  await prepareScreenshot(page);
  await page.screenshot({ path: `${screenshots}/management-additional-duty-1366x768.png`, fullPage: true });

  await page.goto('/quan-tri/kiem-nhiem/danh-muc');
  const dutyDefinitionRow = page.locator('tbody tr', { hasText: 'E2EDUTY' });
  await dutyDefinitionRow.getByRole('button', { name: 'Vô hiệu hóa' }).click();
  await dutyDefinitionRow.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByRole('status').getByText('Đã vô hiệu hóa loại kiêm nhiệm; lịch sử vẫn được giữ.', { exact: true })).toBeVisible();
  await expect(dutyDefinitionRow.getByText('Đã vô hiệu hóa')).toBeVisible();
  await page.goto('/quan-tri/kiem-nhiem/phan-cong');
  const endedDutyRow = page.locator('tbody tr', { hasText: 'E2EDUTY — Kiêm nhiệm E2E Phase 01' });
  await expect(endedDutyRow).toBeVisible();
  await expect(endedDutyRow.getByText('Đã kết thúc')).toBeVisible();

  await page.goto('/quan-tri/nhat-ky');
  await expect(page.getByRole('heading', { name: 'Nhật ký hệ thống' })).toBeVisible();
  const auditEvents = page.getByRole('region', { name: 'Sự kiện nhật ký' });
  await expect(auditEvents.locator('tbody tr', { hasText: 'USER_CREATED' })).toBeVisible();
  await expect(auditEvents.locator('tbody tr', { hasText: 'SUBJECT_GROUP_CREATED' })).toBeVisible();
  await expect(auditEvents.locator('tbody tr', { hasText: 'STAFF_ADDITIONAL_DUTY_ENDED' })).toBeVisible();
  await assertNoSeriousAxeViolations(page);
  await prepareScreenshot(page);
  await page.screenshot({ path: `${screenshots}/management-audit-1366x768.png`, fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: `${screenshots}/management-audit-375x812.png`, fullPage: true });
  await assertAtMobileWidths(page, ['.primary-nav a', '.filter-bar button']);

  await page.getByRole('button', { name: 'Đăng xuất khỏi không gian làm việc', exact: true }).click();
  await page.getByLabel('Tên đăng nhập').fill(targetUsername);
  await page.getByLabel('Mật khẩu').fill(targetInitialPassword);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/doi-mat-khau-lan-dau$/);
  await page.getByLabel('Mật khẩu hiện tại').fill(targetInitialPassword);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill(targetNewPassword);
  await page.getByLabel('Xác nhận mật khẩu mới').fill(targetNewPassword);
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await page.goto('/quan-tri/nguoi-dung');
  await expect(page).toHaveURL(/\/khong-co-quyen$/);
  await expect(page.getByRole('heading', { name: /không có quyền thực hiện thao tác này/i })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Đăng xuất khỏi không gian làm việc', exact: true }).click();
  await page.goto('/quan-tri/nguoi-dung');
  await expect(page).toHaveURL(/\/dang-nhap$/);
});
