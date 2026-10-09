import { describe, expect, it } from 'vitest';
import { needsScroll } from './scroll';

const box = (top: number, height: number) => ({ top, bottom: top + height });

/**
 * Whether the target has to be moved before it can be pointed at.
 *
 * `block: 'nearest'` was the old answer and it put a section flush against the
 * rail's bottom edge — technically visible, with no room beside it for the
 * bubble that is supposed to explain it. The rule now is: leave a target that
 * is comfortably in view alone, and centre one that is not.
 */
describe('needsScroll', () => {
  const view = box(0, 800);

  it('leaves a target that is comfortably in view alone', () => {
    expect(needsScroll(box(300, 100), view)).toBe(false);
  });

  it('moves a target that is below the fold', () => {
    expect(needsScroll(box(900, 100), view)).toBe(true);
  });

  it('moves a target that is above the fold', () => {
    expect(needsScroll(box(-200, 100), view)).toBe(true);
  });

  it('moves a target only partly in view', () => {
    expect(needsScroll(box(760, 100), view)).toBe(true);
  });

  it('moves a target squeezed against the bottom edge, which has no room for a bubble', () => {
    // Fully inside, but with only a few pixels to spare — the case `nearest`
    // used to leave alone and then had nowhere to put the words.
    expect(needsScroll(box(790, 8), view)).toBe(true);
  });

  it('leaves a target alone that clears the edge by more than the margin', () => {
    expect(needsScroll(box(700, 40), view)).toBe(false);
  });

  it('moves a target taller than the view, so its top is at least reachable', () => {
    expect(needsScroll(box(-50, 1200), view)).toBe(true);
  });
});
