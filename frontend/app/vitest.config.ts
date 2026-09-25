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
    /**
     * The suite runs against the mocks, on every machine.
     *
     * `IS_LIVE` is derived from VITE_API_BASE, and Vite loads `.env.local`
     * into a test run exactly as it does into a dev server. So a developer who
     * had pointed their dev server at a local API — the ordinary reason that
     * file exists — silently ran the whole suite in live mode against a
     * backend that was not up, and watched the service workbench tests fail on
     * a fetch while CI, which has no `.env.local`, stayed green. The tests are
     * about the screens, not about what the machine happens to be pointed at,
     * so the variable is pinned empty here rather than left to the filesystem.
     */
    env: { VITE_API_BASE: '' },
  },
});
