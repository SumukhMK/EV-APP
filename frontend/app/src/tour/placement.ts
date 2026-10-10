/**
 * Where the bubble sits, worked out from the target.
 *
 * One fixed placement cannot serve both kinds of target this app has. The rail
 * is a 232px column hard against the left edge and wants the bubble beside it;
 * the stat-tile strip is nearly the full width of the content column and has no
 * "beside" at all. Pinning everything to `right-start` put the tile step's
 * bubble off the right of the screen, and put every step off the screen on a
 * phone.
 *
 * Popper's own `flip` cannot rescue that: flipping right to left needs room on
 * the left, and a target that spans the window has room on neither side. The
 * answer has to be "go underneath", and that is a decision about the target's
 * width, which is what this function makes.
 *
 * Kept as a pure function of two numbers so it can be tested properly — jsdom
 * has no layout engine, so a rule that only existed inside the component could
 * only ever be checked by eye in a browser.
 */

/** Matches the `sm` widths in `TourStage`; the rule needs to know what it is placing. */
export const BUBBLE_WIDTH = 340;
/** An *about* step carries a paragraph, so it gets a wider card — and the rule has to allow for it. */
export const WIDE_BUBBLE_WIDTH = 460;

/** Breathing room between the bubble and the window edge. */
const GUTTER = 16;

export type Placement = 'right-start' | 'left-start' | 'bottom-start';

export function placementFor(
  rect: { left: number; right: number; width: number },
  viewportWidth: number,
  bubbleWidth: number = BUBBLE_WIDTH,
): Placement {
  const needed = bubbleWidth + GUTTER * 2;

  // A target that takes up half the window or more has no usable side, however
  // much room the window has in total.
  if (rect.width >= viewportWidth / 2) return 'bottom-start';

  if (viewportWidth - rect.right >= needed) return 'right-start';
  if (rect.left >= needed) return 'left-start';
  return 'bottom-start';
}
