/**
 * Whether a target has to be moved before the tour can point at it.
 *
 * The old rule was `scrollIntoView({ block: 'nearest' })` on every step, which
 * has two faults. It moves things that were already perfectly visible, and when
 * it does move something it parks it flush against the edge it came in from —
 * so a nav section arrives technically in view with no room beside it for the
 * bubble that is meant to explain it.
 *
 * So: leave a target that clears both edges by a comfortable margin, and centre
 * anything else.
 */

/** Room a target must have above and below before it counts as comfortably in view. */
const MARGIN = 24;

interface Span {
  top: number;
  bottom: number;
}

export function needsScroll(target: Span, view: Span): boolean {
  return target.top < view.top + MARGIN || target.bottom > view.bottom - MARGIN;
}

/**
 * The box a target has to be visible *inside*.
 *
 * Not always the window: the rail is its own scrolling column, so a section can
 * sit well within the viewport and still be scrolled out of the rail. The
 * element's rect is reported in viewport coordinates either way, which is why
 * this returns a rect rather than the element.
 */
export function viewportFor(element: HTMLElement): Span {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      const rect = node.getBoundingClientRect();
      // jsdom has no layout, so every rect is zero — fall through to the window
      // rather than declare a zero-height viewport nothing can be visible in.
      if (rect.height > 0) return { top: rect.top, bottom: rect.bottom };
    }
  }
  return { top: 0, bottom: window.innerHeight };
}
