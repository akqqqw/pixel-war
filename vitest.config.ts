import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The browser build ships dist; phaser's src entry needs a debug-only module.
      phaser: 'phaser/dist/phaser.js',
    },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    setupFiles: ['src/tests/setup/canvasShim.ts'],
  },
});
