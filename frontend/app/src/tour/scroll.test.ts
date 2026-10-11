import { describe, expect, it } from 'vitest';
import { needsScroll, revealBlock } from './scroll';

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

/**
 * Where a target should come to rest once it is being scrolled to.
 *
 * Centring is right for a card that fits. For one taller than the window —
 * an accounts table, a long list of available bikes — centring pushes its top
 * off the screen, and the bubble aligns to that top, so the words about the
 * card land somewhere nobody can read them. Those get their top aligned
 * instead, which is the part you actually need to see.
 */
describe('revealBlock', () => {
  const view = { top: 0, bottom: 800 };

  it('centres a card that comfortably fits', () => {
    expect(revealBlock({ top: 900, bottom: 1100 }, view)).toBe('center');
  });

  it('aligns the top of a card taller than the window', () => {
    expect(revealBlock({ top: 100, bottom: 1600 }, view)).toBe('start');
  });

  it('aligns the top of a card that is almost exactly the window height', () => {
    expect(revealBlock({ top: 0, bottom: 790 }, view)).toBe('start');
  });

  it('still centres a short card near the bottom', () => {
    expect(revealBlock({ top: 760, bottom: 820 }, view)).toBe('center');
  });
});
