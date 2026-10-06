import { expect, test } from '@playwright/test';
import { BASE_URL } from '../playwright.config';

test.describe.configure({ retries: 0 });

test('PWA production baseline: manifest, icons, service worker script, and app shell are reachable', async ({ page, request }) => {
  // 1. Web App Manifest reachable and valid
  const manifestRes = await request.get(`${BASE_URL}/manifest.webmanifest`);
  expect(manifestRes.ok(), `Manifest not reachable at ${BASE_URL}/manifest.webmanifest`).toBeTruthy();
  const manifest = await manifestRes.json();

  expect(manifest.name).toBe('Báo giảng CM Đam San');
  expect(manifest.short_name).toBe('Báo giảng');
  expect(manifest.lang).toBe('vi');
  expect(manifest.start_url).toBe('/');
  expect(manifest.scope).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.theme_color).toBe('#1F4358');
  expect(manifest.background_color).toBe('#F3F6F7');

  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

  const icon192 = manifest.icons.find((i: { sizes: string }) => i.sizes === '192x192');
  expect(icon192).toBeDefined();

  const icon512 = manifest.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === '512x512' && (!i.purpose || i.purpose === 'any'));
  expect(icon512).toBeDefined();

  const maskableIcon = manifest.icons.find((i: { purpose?: string }) => i.purpose === 'maskable');
  expect(maskableIcon).toBeDefined();

  // 2. Install icon reachable
  const iconRes = await request.get(`${BASE_URL}/pwa-192x192.png`);
  expect(iconRes.ok(), 'pwa-192x192.png must be reachable').toBeTruthy();
  expect(iconRes.headers()['content-type']).toContain('image/png');

  // 3. Service worker script reachable and contains strict security invariants
  const swRes = await request.get(`${BASE_URL}/sw.js`);
  expect(swRes.ok(), 'sw.js must be reachable').toBeTruthy();
  const swText = await swRes.text();
  const compactSwText = swText.replace(/\s+/g, '');
  expect(compactSwText).toContain('NetworkOnly');
  expect(compactSwText).toContain('SKIP_WAITING');
  expect(compactSwText).toContain('denylist:[/^\\/api/]');
  expect(compactSwText).not.toMatch(/url:"\/?api/i);
  expect(compactSwText).not.toMatch(/BackgroundSync|QueuePlugin/i);

  // 4. App shell loads cleanly with PWA meta tags
  await page.goto('/dang-nhap');
  await expect(page).toHaveTitle(/Báo giảng CM Đam San/);

  const themeColorMeta = page.locator('meta[name="theme-color"]');
  await expect(themeColorMeta).toHaveAttribute('content', '#1F4358');

  const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]').first();
  await expect(appleTouchIcon).toBeVisible({ visible: false }); // link in head
  const appleHref = await appleTouchIcon.getAttribute('href');
  expect(appleHref).toMatch(/apple-touch-icon/);

  // 5. Service worker registration and active state via navigator.serviceWorker.ready
  const swSupported = await page.evaluate(() => 'serviceWorker' in navigator);
  expect(swSupported).toBe(true);

  const registrationState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return {
      hasRegistration: !!reg,
      hasActive: !!reg.active,
      scope: reg.scope,
    };
  });
  expect(registrationState.hasRegistration).toBe(true);
  expect(registrationState.hasActive).toBe(true);

  // 6. Reload once to ensure the active service worker controls the page client
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  const hasController = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  expect(hasController).toBe(true);

  // 7. Runtime /api cache negative evidence: live GET /api/health/live must use network and never enter Cache Storage
  const liveApiResponse = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/health/live', { method: 'GET' });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } catch (err: unknown) {
      return { ok: false, status: 0, error: (err as Error).message };
    }
  });

  expect(liveApiResponse.ok, `Live /api/health/live failed: ${JSON.stringify(liveApiResponse)}`).toBe(true);
  expect(liveApiResponse.status).toBe(200);
  expect(liveApiResponse.data?.status).toBe('ok');

  // Inspect all caches in Cache Storage API: zero /api requests may be stored
  const cacheAudit = await page.evaluate(async () => {
    const cacheNames = await window.caches.keys();
    const apiCachedUrls: string[] = [];
    for (const name of cacheNames) {
      const cache = await window.caches.open(name);
      const requests = await cache.keys();
      for (const req of requests) {
        const url = new URL(req.url);
        if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
          apiCachedUrls.push(`cache[${name}] -> ${url.pathname}`);
        }
      }
    }
    return { cacheNames, apiCachedUrls };
  });

  expect(cacheAudit.apiCachedUrls).toEqual([]);

  // 8. Negative offline fallback evidence: offline GET /api/health/live must fail / reject without serving cached response
  try {
    await page.context().setOffline(true);

    const offlineFetchResult = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/health/live', { method: 'GET' });
        // If the service worker returned a cached response or fallback, res would resolve
        const text = await res.text();
        return { resolved: true, status: res.status, body: text };
      } catch (err: unknown) {
        // True NetworkOnly without cache fallback must reject with a network error
        return { resolved: false, error: (err as Error).message };
      }
    });

    expect(offlineFetchResult.resolved, 'Offline /api request unexpectedly resolved from cache or fallback!').toBe(false);
  } finally {
    // Always restore online status to protect any downstream tests
    await page.context().setOffline(false);
  }
});
