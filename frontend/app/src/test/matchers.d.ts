/**
 * `jest-axe` ships Jest typings, and we run Vitest. Rather than pull in Jest's
 * globals just to satisfy one matcher, the matcher is declared against Vitest's
 * own `Assertion` — which is what `expect.extend` in `setup.ts` actually adds it to.
 */
import 'vitest';

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
