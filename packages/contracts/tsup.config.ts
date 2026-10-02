import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/ppct-import.ts', 'src/historical-teaching.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
});
