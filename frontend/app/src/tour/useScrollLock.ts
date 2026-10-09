import { useEffect } from 'react';

/**
 * Holds the page still while the tour is talking.
 *
 * The ring is drawn where the target is. Scroll the page out from under it and
 * the reader is looking at a highlight sitting over whatever has slid into that
 * spot — which is the same confusion the drift bug caused, arrived at from the
 * other direction.
 *
 * **Why gestures rather than `overflow: hidden`.** The obvious lock is to pin
 * the body, and it would be wrong here: the tour scrolls the page itself to
 * bring a target into view, and a pinned body stops that too. So the gestures a
 * *person* scrolls with are swallowed, and programmatic scrolling is untouched.
 * It also sidesteps the layout shift that hiding the scrollbar causes.
 *
 * The keyboard half is deliberately narrow. Tab and Enter reach and press the
 * bubble's own buttons and Escape leaves — block those and a keyboard user is
 * trapped in a tour they cannot dismiss, which is a far worse bug than a page
 * that scrolled. Space is a scroll key on the page and an ordinary character in
 * a text field, so it is only swallowed outside one.
 */

/** Keys that scroll the page. Anything not listed here is left alone. */
const SCROLL_KEYS = new Set([
  'PageDown',
  'PageUp',
  'Home',
  'End',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  ' ',
]);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;

    const swallow = (event: Event) => event.preventDefault();

    const onKey = (event: KeyboardEvent) => {
      if (!SCROLL_KEYS.has(event.key)) return;
      if (isTyping(event.target)) return;
      event.preventDefault();
    };

    // `passive: false` or the browser ignores `preventDefault` on these two —
    // both default to passive on window, which is the whole reason a naive
    // listener here looks like it does nothing.
    window.addEventListener('wheel', swallow, { passive: false });
    window.addEventListener('touchmove', swallow, { passive: false });
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('wheel', swallow);
      window.removeEventListener('touchmove', swallow);
      window.removeEventListener('keydown', onKey);
    };
  }, [locked]);
}
