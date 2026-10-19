import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const screenshotsDir = path.resolve(process.cwd(), 'test-results', 'p5-052');

async function prepareScreenshot(page: Page) {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function assertNoSeriousAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = result.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(serious, serious.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
}

test.describe('P5-052: Task-Oriented Workspace & Information Architecture Screenshots (MOCK Fixtures)', () => {
  test.describe.configure({ retries: 0 });

  test('Teacher Baseline Persona — Viewports 320/375/414/1366/1440 (MOCK fixture)', async ({ page }) => {
    // Mock user auth
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'mock-teacher-1',
            username: 'cobe',
            displayName: 'Cô Nguyễn Thị Bé (MOCK)',
            positionTitle: 'Giáo viên Toán',
            status: 'ACTIVE',
            mustChangePassword: false,
          },
          capabilities: [
            { key: 'TEACHER_BASE', scope: 'PERSONAL' },
            { key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' },
            { key: 'REPORTING_STATEMENT_READ', scope: 'PERSONAL' },
          ],
        }),
      }),
    );

    await page.route('**/api/reporting-statements/mine*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], page: 1, pageSize: 1, total: 8 }),
      }),
    );

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /chào cô nguyễn thị bé/i })).toBeVisible();
    await assertNoSeriousAxeViolations(page);

    const viewports = [
      { width: 320, height: 640 },
      { width: 375, height: 812 },
      { width: 414, height: 896 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await prepareScreenshot(page);
      await page.screenshot({
        path: path.join(screenshotsDir, `mock-teacher-workspace-${vp.width}x${vp.height}.png`),
      });
    }
  });

  test('Vice Principal (PHT) Persona — Pending queue & Academic data (MOCK fixture)', async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'mock-pht-1',
            username: 'pht-le',
            displayName: 'Thầy Lê Văn Cường - PHT (MOCK)',
            positionTitle: 'Phó Hiệu trưởng',
            status: 'ACTIVE',
            mustChangePassword: false,
          },
          capabilities: [
            { key: 'TEACHER_BASE', scope: 'PERSONAL' },
            { key: 'APPROVAL_VICE_PRINCIPAL', scope: 'SCHOOL_WIDE' },
            { key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' },
            { key: 'ACADEMIC_STRUCTURE_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'SUBJECT_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'HOMEROOM_ASSIGNMENT_MANAGE', scope: 'SCHOOL_WIDE' },
          ],
        }),
      }),
    );

    await page.route('**/api/reporting-statements/pending-decision*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], page: 1, pageSize: 1, total: 6 }),
      }),
    );

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /chào thầy lê văn cường/i })).toBeVisible();
    await expect(page.getByText(/có 6 báo cáo chờ phê duyệt/i)).toBeVisible();
    await assertNoSeriousAxeViolations(page);

    const viewports = [
      { width: 375, height: 812 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await prepareScreenshot(page);
      await page.screenshot({
        path: path.join(screenshotsDir, `mock-pht-workspace-${vp.width}x${vp.height}.png`),
      });
    }

    // Capture dropdown expanded state at 1366x768
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole('button', { name: /dữ liệu năm học/i }).click();
    await prepareScreenshot(page);
    await page.screenshot({
      path: path.join(screenshotsDir, 'mock-pht-dropdown-open-1366x768.png'),
    });
  });

  test('Multi-Grant Admin Persona — Viewports and Mobile Drawer (MOCK fixture)', async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'mock-admin-multi',
            username: 'admin-tran',
            displayName: 'Trần Văn Quản Trị (MOCK)',
            positionTitle: 'Cán bộ CNTT & Quản lý',
            status: 'ACTIVE',
            mustChangePassword: false,
          },
          capabilities: [
            { key: 'TEACHER_BASE', scope: 'PERSONAL' },
            { key: 'APPROVAL_PRINCIPAL', scope: 'SCHOOL_WIDE' },
            { key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' },
            { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'CAPABILITY_GRANT', scope: 'SCHOOL_WIDE' },
            { key: 'BUSINESS_CONFIGURATION_MANAGE', scope: 'SCHOOL_WIDE' },
            { key: 'AUDIT_VIEW', scope: 'SCHOOL_WIDE' },
          ],
        }),
      }),
    );

    await page.route('**/api/reporting-statements/pending-decision*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], page: 1, pageSize: 1, total: 2 }),
      }),
    );

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /chào trần văn quản trị/i })).toBeVisible();

    // Desktop 1366 and 1440
    for (const vp of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(vp);
      await prepareScreenshot(page);
      await page.screenshot({
        path: path.join(screenshotsDir, `mock-multi-admin-workspace-${vp.width}x${vp.height}.png`),
      });
    }

    // Mobile drawer open at 375x812
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: /thực đơn/i }).click();
    await expect(page.getByLabel('Thực đơn di động')).toBeVisible();
    await prepareScreenshot(page);
    await page.screenshot({
      path: path.join(screenshotsDir, 'mock-multi-admin-mobile-drawer-375x812.png'),
    });
  });

  test('Access Denied Page — Neutral Respectful Guidance (MOCK fixture)', async ({ page }) => {
    await page.goto('/khong-co-quyen');
    await expect(page.getByRole('heading', { name: /bạn không có quyền thực hiện thao tác này/i })).toBeVisible();
    await assertNoSeriousAxeViolations(page);

    await page.setViewportSize({ width: 1366, height: 768 });
    await prepareScreenshot(page);
    await page.screenshot({
      path: path.join(screenshotsDir, 'access-denied-1366x768.png'),
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await prepareScreenshot(page);
    await page.screenshot({
      path: path.join(screenshotsDir, 'access-denied-375x812.png'),
    });
  });
});
