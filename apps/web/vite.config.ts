/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@baogiang/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@baogiang/config': resolve(__dirname, '../../packages/config/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    alias: {
      '@baogiang/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@baogiang/config': resolve(__dirname, '../../packages/config/src/index.ts'),
    },
  },
});
