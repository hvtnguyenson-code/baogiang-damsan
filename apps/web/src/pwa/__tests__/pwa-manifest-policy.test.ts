import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA Manifest & Service Worker Security Contract', () => {
  const webRoot = path.resolve(__dirname, '../../..');
  const viteConfigPath = path.join(webRoot, 'vite.config.ts');
  const publicDir = path.join(webRoot, 'public');

  it('declares exact required Web App Manifest fields in vite.config.ts', () => {
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    // Required fields per spec §7
    expect(content).toContain("name: 'Báo giảng CM Đam San'");
    expect(content).toContain("short_name: 'Báo giảng'");
    expect(content).toContain("lang: 'vi'");
    expect(content).toContain("start_url: '/'");
    expect(content).toContain("scope: '/'");
    expect(content).toContain("display: 'standalone'");

    // DESIGN.md semantic tokens
    expect(content).toContain("theme_color: '#1F4358'"); // school-800
    expect(content).toContain("background_color: '#F3F6F7'"); // mist-50
  });

  it('configures standard install icons including 192, 512 and maskable', () => {
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    expect(content).toContain("src: '/pwa-192x192.png'");
    expect(content).toContain("sizes: '192x192'");
    expect(content).toContain("src: '/pwa-512x512.png'");
    expect(content).toContain("sizes: '512x512'");
    expect(content).toContain("src: '/pwa-maskable-512x512.png'");
    expect(content).toContain("purpose: 'maskable'");
  });

  it('has all required static PWA icon assets in public directory with positive size', () => {
    const requiredFiles = [
      'favicon.svg',
      'pwa-192x192.png',
      'pwa-512x512.png',
      'pwa-maskable-512x512.png',
      'apple-touch-icon.png',
      'apple-touch-icon-180x180.png',
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(publicDir, file);
      expect(fs.existsSync(filePath), `Missing asset: ${file}`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size, `Empty asset: ${file}`).toBeGreaterThan(100);
    }
  });

  it('proves /api is strictly excluded from Workbox navigation fallback', () => {
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    // navigateFallbackDenylist MUST contain /^\/api/
    expect(content).toMatch(/navigateFallbackDenylist:\s*\[\s*\/[^\s]*api/);
  });

  it('proves /api has strictly NetworkOnly runtime caching and no cache strategy', () => {
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    // runtimeCaching must map /^\/api/ to NetworkOnly
    expect(content).toContain("handler: 'NetworkOnly'");

    // FORBIDDEN caching strategies for /api
    expect(content).not.toMatch(/urlPattern:[^}]*api[^}]*handler:\s*['"]CacheFirst/);
    expect(content).not.toMatch(/urlPattern:[^}]*api[^}]*handler:\s*['"]NetworkFirst/);
    expect(content).not.toMatch(/urlPattern:[^}]*api[^}]*handler:\s*['"]StaleWhileRevalidate/);

    // FORBIDDEN Workbox background sync / offline queues
    expect(content).not.toContain('BackgroundSync');
    expect(content).not.toContain('backgroundSync');
    expect(content).not.toContain('QueuePlugin');
  });

  it('proves index.html contains theme-color meta and apple-touch-icon links', () => {
    const indexPath = path.join(webRoot, 'index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf8');

    expect(indexContent).toContain('<meta name="theme-color" content="#1F4358" />');
    expect(indexContent).toMatch(/<link\s+rel="apple-touch-icon"[^>]*href="\/apple-touch-icon-180x180\.png"/);
    expect(indexContent).toMatch(/<link\s+rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/);
  });
});
