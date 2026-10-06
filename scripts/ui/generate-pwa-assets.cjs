const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const outputDir = path.resolve(__dirname, '../../apps/web/public');

const BOOK_PATH = 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25';

function createSvg({ size, radius = 0, isMaskable = false }) {
  // If maskable, full bleed background with book inside safe zone (40% radius from center)
  // ViewBox 24x24: center is (12, 12).
  // In 24x24 coordinate, book bounds are x: [3, 21] (width 18), y: [3.75, 20.292] (height 16.54)
  // For maskable, safe zone has radius 24 * 0.4 = 9.6. Scale book so it comfortably fits in safe zone.
  if (isMaskable) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
  <rect width="24" height="24" fill="#1F4358"/>
  <g transform="translate(12, 12) scale(0.72) translate(-12, -12)">
    <path d="${BOOK_PATH}" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
  }

  const rx = radius ? radius : Math.round(size * 0.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
  <rect width="24" height="24" rx="${(rx / size) * 24}" fill="#1F4358"/>
  <g transform="translate(12, 12) scale(0.78) translate(-12, -12)">
    <path d="${BOOK_PATH}" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

async function main() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Also update favicon.svg to use school-800 (#1F4358)
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <rect width="24" height="24" rx="6" fill="#1F4358"/>
  <path d="${BOOK_PATH}" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
  fs.writeFileSync(path.join(outputDir, 'favicon.svg'), faviconSvg, 'utf8');
  console.log('Updated favicon.svg with school-800 (#1F4358)');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const targets = [
    { filename: 'pwa-192x192.png', size: 192, isMaskable: false },
    { filename: 'pwa-512x512.png', size: 512, isMaskable: false },
    { filename: 'pwa-maskable-512x512.png', size: 512, isMaskable: true },
    { filename: 'apple-touch-icon.png', size: 180, isMaskable: true },
    { filename: 'apple-touch-icon-180x180.png', size: 180, isMaskable: true },
  ];

  for (const { filename, size, isMaskable } of targets) {
    const svg = createSvg({ size, isMaskable });
    const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

    await page.setViewportSize({ width: size, height: size });
    await page.goto(dataUri);

    const outPath = path.join(outputDir, filename);
    await page.screenshot({ path: outPath, omitBackground: !isMaskable });
    const stat = fs.statSync(outPath);
    console.log(`Generated ${filename} (${size}x${size}, ${stat.size} bytes)`);
  }

  await browser.close();
  console.log('All PWA assets successfully generated.');
}

main().catch((err) => {
  console.error('Failed to generate PWA assets:', err);
  process.exit(1);
});
