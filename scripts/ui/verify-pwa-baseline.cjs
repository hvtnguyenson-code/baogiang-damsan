const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

const requiredFiles = [
  'docs/requirements/P5-020-PWA-PRODUCTION-BASELINE.md',
  'apps/web/vite.config.ts',
  'apps/web/index.html',
  'apps/web/src/pwa/pwa-update-notice.tsx',
  'apps/web/src/pwa/pwa-manager.tsx',
  'apps/web/public/favicon.svg',
  'apps/web/public/pwa-192x192.png',
  'apps/web/public/pwa-512x512.png',
  'apps/web/public/pwa-maskable-512x512.png',
  'apps/web/public/apple-touch-icon.png',
  'apps/web/public/apple-touch-icon-180x180.png',
];

function verifyFilesExist() {
  for (const rel of requiredFiles) {
    const full = path.join(root, rel);
    assert.ok(fs.existsSync(full), `Required PWA file missing: ${rel}`);
    const stat = fs.statSync(full);
    assert.ok(stat.size > 0, `File is empty: ${rel}`);
  }
}

function verifyViteConfig() {
  const file = path.join(root, 'apps/web/vite.config.ts');
  const text = fs.readFileSync(file, 'utf8');

  // Manifest contract
  assert.ok(text.includes("name: 'Báo giảng CM Đam San'"), 'Manifest name missing or drifted');
  assert.ok(text.includes("short_name: 'Báo giảng'"), 'Manifest short_name missing or drifted');
  assert.ok(text.includes("lang: 'vi'"), 'Manifest lang vi missing');
  assert.ok(text.includes("start_url: '/'"), 'Manifest start_url missing');
  assert.ok(text.includes("scope: '/'"), 'Manifest scope missing');
  assert.ok(text.includes("display: 'standalone'"), 'Manifest display standalone missing');
  assert.ok(text.includes("theme_color: '#1F4358'"), 'theme_color must match DESIGN.md school-800 (#1F4358)');
  assert.ok(text.includes("background_color: '#F3F6F7'"), 'background_color must match DESIGN.md mist-50 (#F3F6F7)');

  // Icons
  assert.ok(text.includes("src: '/pwa-192x192.png'"), 'Manifest 192 icon missing');
  assert.ok(text.includes("src: '/pwa-512x512.png'"), 'Manifest 512 icon missing');
  assert.ok(text.includes("src: '/pwa-maskable-512x512.png'"), 'Manifest maskable icon missing');

  // Service worker security boundaries
  assert.ok(text.includes("navigateFallback: '/index.html'"), 'navigateFallback missing');
  assert.match(text, /navigateFallbackDenylist:\s*\[\s*\/[^\s]*api/, 'navigateFallbackDenylist must exclude /api');
  assert.ok(text.includes("handler: 'NetworkOnly'"), '/api route must be strictly NetworkOnly');

  // Negative checks
  assert.doesNotMatch(text, /urlPattern:[^}]*api[^}]*handler:\s*['"]CacheFirst/i, 'Forbidden: CacheFirst on /api');
  assert.doesNotMatch(text, /urlPattern:[^}]*api[^}]*handler:\s*['"]NetworkFirst/i, 'Forbidden: NetworkFirst on /api');
  assert.doesNotMatch(text, /urlPattern:[^}]*api[^}]*handler:\s*['"]StaleWhileRevalidate/i, 'Forbidden: StaleWhileRevalidate on /api');
  assert.doesNotMatch(text, /BackgroundSync|QueuePlugin/i, 'Forbidden: BackgroundSync / offline mutation queue');
}

function verifyUpdateNotice() {
  const file = path.join(root, 'apps/web/src/pwa/pwa-update-notice.tsx');
  const text = fs.readFileSync(file, 'utf8');

  // Exact Vietnamese copy
  assert.ok(text.includes('Có phiên bản mới của Báo giảng.'), 'Missing required notice text');
  assert.ok(text.includes('Tải lại để cập nhật'), 'Missing primary action text');
  assert.ok(text.includes('Để sau'), 'Missing secondary action text');

  // Accessibility semantics
  assert.ok(text.includes('role="status"'), 'Missing role="status"');
  assert.ok(text.includes('aria-live="polite"'), 'Missing aria-live="polite"');
}

function verifyIndexHtml() {
  const file = path.join(root, 'apps/web/index.html');
  const text = fs.readFileSync(file, 'utf8');

  assert.ok(text.includes('<meta name="theme-color" content="#1F4358" />'), 'index.html missing theme-color meta');
  assert.ok(text.includes('rel="apple-touch-icon"'), 'index.html missing apple-touch-icon');
  assert.ok(text.includes('favicon.svg'), 'index.html missing favicon');
}

function verifyDistArtifactsIfPresent() {
  const distDir = path.join(root, 'apps/web/dist');
  if (!fs.existsSync(distDir)) {
    return;
  }

  // 1. Manifest
  const manifestFile = path.join(distDir, 'manifest.webmanifest');
  assert.ok(fs.existsSync(manifestFile), 'Dist missing manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(manifest.name, 'Báo giảng CM Đam San');
  assert.equal(manifest.short_name, 'Báo giảng');
  assert.equal(manifest.theme_color, '#1F4358');
  assert.equal(manifest.background_color, '#F3F6F7');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'Manifest icons array invalid');

  // 2. Service Worker
  const swFile = path.join(distDir, 'sw.js');
  assert.ok(fs.existsSync(swFile), 'Dist missing sw.js');
  const swText = fs.readFileSync(swFile, 'utf8');

  assert.ok(swText.includes('denylist:[/^\\/api/]'), 'sw.js missing navigation fallback denylist for /api');
  assert.ok(swText.includes('NetworkOnly'), 'sw.js missing NetworkOnly handler for /api');
  assert.ok(swText.includes('SKIP_WAITING'), 'sw.js missing SKIP_WAITING listener');

  // Ensure no /api request is in precached items
  assert.doesNotMatch(swText, /url:"api\//i, 'sw.js must never precache /api routes');
  assert.doesNotMatch(swText, /url:"\/api/i, 'sw.js must never precache /api routes');
}

function selfTest() {
  // Self test ensuring assertions catch regressions
  const dummyConfig = "navigateFallback: '/index.html'";
  assert.throws(() => {
    assert.match(dummyConfig, /navigateFallbackDenylist:\s*\[\s*\/[^\s]*api/);
  }, /navigateFallbackDenylist/);
}

function main() {
  selfTest();
  verifyFilesExist();
  verifyViteConfig();
  verifyUpdateNotice();
  verifyIndexHtml();
  verifyDistArtifactsIfPresent();
  console.log('[pwa-baseline-verifier] PASS (manifest, icons, SW policies, update UI, and build artifacts verified).');
}

main();
