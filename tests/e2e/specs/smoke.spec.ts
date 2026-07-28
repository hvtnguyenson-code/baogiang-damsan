import { test, expect } from '@playwright/test';
import { API_URL } from '../playwright.config';

/**
 * Smoke tests for Phase 00 — Foundation
 *
 * These tests verify the basic structure of the app is working:
 * 1. Home page loads with correct content
 * 2. Navigate to System Status page
 * 3. API status is displayed
 * 4. No JavaScript console errors
 */

test.describe('Phase 00 Smoke Tests', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
  });

  // ---- Test 1: Home page ----
  test('home page loads with system name', async ({ page }) => {
    await page.goto('/');

    // Wait for main content
    await expect(page.locator('#main-content')).toBeVisible();

    // System name should be visible
    await expect(
      page.getByText(/hệ thống báo giảng đam san/i),
    ).toBeVisible();

    // Phase notice should be visible
    await expect(page.getByText(/phase 00/i).first()).toBeVisible();

    // School name should be visible
    await expect(
      page.getByText(/trường ptdtnt thpt đam san/i).first(),
    ).toBeVisible();
  });

  // ---- Test 2: No role selector ----
  test('home page does NOT have a role selector', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#main-content')).toBeVisible();

    // No combobox/select for role switching
    const roleSelector = page.locator('[id*="role"], select[id*="role"]');
    await expect(roleSelector).toHaveCount(0);
  });

  // ---- Test 3: Navigate to System Status ----
  test('can navigate to system status page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#main-content')).toBeVisible();

    // Click the system status link
    await page.click('#link-system-status');
    await expect(page).toHaveURL(/\/system-status/);

    // Page header should be visible
    await expect(
      page.getByRole('heading', { name: /trạng thái hệ thống/i }),
    ).toBeVisible();
  });

  // ---- Test 4: System status shows API status ----
  test('system status page displays API status', async ({ page }) => {
    await page.goto('/system-status');

    // Wait for loading to complete (either ok or error badge appears)
    await page.waitForSelector('.badge', { timeout: 15000 });

    // Should have status for API and database sections
    await expect(
      page.getByText(/api — tiến trình/i),
    ).toBeVisible();

    await expect(
      page.getByText(/cơ sở dữ liệu — postgresql/i),
    ).toBeVisible();
  });

  // ---- Test 5: Retry button works ----
  test('retry button is present and functional', async ({ page }) => {
    await page.goto('/system-status');
    await page.waitForSelector('#btn-retry-status', { timeout: 10000 });

    const retryBtn = page.locator('#btn-retry-status');
    await expect(retryBtn).toBeVisible();
    await expect(retryBtn).toBeEnabled();

    // Click retry - should not throw
    await retryBtn.click();
  });

  // ---- Test 6: 404 page ----
  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');

    await expect(page.getByText(/404/)).toBeVisible();
    await expect(
      page.getByText(/trang không tồn tại/i),
    ).toBeVisible();

    const homeLink = page.locator('#link-go-home');
    await expect(homeLink).toBeVisible();
  });

  // ---- Test 7: API health endpoint directly ----
  test('API health/live endpoint returns ok', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/health/live`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  // ---- Test 8: No serious JS errors ----
  test('no critical JavaScript errors on home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#main-content')).toBeVisible();
    await page.waitForTimeout(1000);

    // Filter out known non-critical errors (like network errors to API when API not running)
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('fetch') &&
        !err.includes('NetworkError') &&
        !err.includes('Failed to fetch') &&
        !err.includes('api/health'),
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
