import { useEffect, useState } from 'react';

/**
 * Where the target is, every frame, for as long as the step is on screen.
 *
 * The spotlight used to read the rect once during render and write it out as
 * fixed coordinates. Then the tour smooth-scrolled the rail to bring the next
 * section into view, the section travelled 130 pixels, and the ring stayed
 * behind — drawn around "Sign out" while the bubble next to it explained Money.
 * The bubble was always right, which made the fault look mysterious: Popper
 * keeps itself in place on scroll, and nothing kept the ring in place.
 *
 * Watching every frame is deliberately blunt. The alternative is enumerating
 * the things that can move a target — a scroll in flight, the user scrolling,
 * the rail collapsing, a window resize, a late image reflowing the column — and
 * subscribing to each. That list is wrong the moment somebody adds to the rail.
 * A rect read is cheap, there is exactly one of them, and it only runs while a
 * tour step is actually showing.
 */

export interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function read(element: HTMLElement): TargetRect {
  const { top, left, width, height } = element.getBoundingClientRect();
  return { top, left, width, height };
}

function same(a: TargetRect | null, b: TargetRect | null): boolean {
  if (a === null || b === null) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

export function useTargetRect(element: HTMLElement | null): TargetRect | null {
  const [rect, setRect] = useState<TargetRect | null>(() => (element ? read(element) : null));

  // A new target is measured during render, so the ring is never painted once
  // around the previous step's element before the frame loop catches up.
  const [lastElement, setLastElement] = useState(element);
  if (lastElement !== element) {
    setLastElement(element);
    setRect(element ? read(element) : null);
  }

  useEffect(() => {
    if (!element) return;

    let frame = requestAnimationFrame(function watch() {
      // Only a real move re-renders. A target sitting still — which is most of
      // every step — costs one rect read a frame and nothing else.
      setRect((previous) => {
        const next = read(element);
        return same(previous, next) ? previous : next;
      });
      frame = requestAnimationFrame(watch);
    });

    return () => cancelAnimationFrame(frame);
  }, [element]);

  return rect;
}
