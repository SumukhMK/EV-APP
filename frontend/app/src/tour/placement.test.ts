import { describe, expect, it } from 'vitest';
import { BUBBLE_WIDTH, placementFor } from './placement';

const rect = (left: number, width: number) => ({ left, right: left + width, width });

/**
 * Where the bubble goes, decided from the target rather than fixed.
 *
 * A single placement cannot work for both kinds of target this app has: the
 * rail is a narrow column hard against the left edge, and the stat-tile strip
 * is nearly as wide as the content column. `right-start` suits the first and
 * pushes the second clean off the screen, which is what it did.
 */
describe('placementFor', () => {
  const WIDE = 1512;
  const PHONE = 390;

  it('puts the bubble beside a narrow target on the left, like the rail', () => {
    expect(placementFor(rect(0, 232), WIDE)).toBe('right-start');
  });

  it('puts the bubble on the inside of a narrow target hard against the right edge', () => {
    expect(placementFor(rect(1430, 43), WIDE)).toBe('left-start');
  });

  it('goes underneath a target too wide to sit beside, like the stat tiles', () => {
    expect(placementFor(rect(264, 1200), WIDE)).toBe('bottom-start');
  });

  it('goes underneath on a phone, where nothing fits beside anything', () => {
    expect(placementFor(rect(16, 120), PHONE)).toBe('bottom-start');
  });

  it('goes underneath when neither side has room for the bubble', () => {
    // A target centred in a window barely wider than two bubbles.
    expect(placementFor(rect(300, 200), 800)).toBe('bottom-start');
  });

  it('prefers the right when both sides would fit, so reading order is kept', () => {
    expect(placementFor(rect(500, 100), 2400)).toBe('right-start');
  });

  it('declares a bubble width the caller and the rule agree on', () => {
    expect(BUBBLE_WIDTH).toBeGreaterThan(0);
  });
});
