import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The safety net BUILD.md's H1 asks for.
 *
 * Kept apart from `vite.config.ts` so the build config stays about shipping and
 * this one stays about checking. jsdom rather than a browser runner: every
 * sweep we care about — contrast, bands, fleet totals, period maths — is a pure
 * computation or a single component, and none of them needs a real paint.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    restoreMocks: true,
  },
});
