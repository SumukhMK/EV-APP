import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useScrollLock } from './useScrollLock';

/**
 * While the tour is talking, the page holds still.
 *
 * The ring is drawn at the target's position; if the reader scrolls the page
 * out from under it they are looking at a highlight over whatever happens to be
 * there now. The tour already moves the page itself when it needs to — that is
 * the part that must keep working, and it is why this blocks the gestures
 * rather than setting `overflow: hidden`, which would stop the tour scrolling
 * to its own target as well.
 */
describe('useScrollLock', () => {
  function wheel() {
    const event = new WheelEvent('wheel', { cancelable: true, bubbles: true, deltaY: 120 });
    window.dispatchEvent(event);
    return event;
  }

  function touch() {
    const event = new Event('touchmove', { cancelable: true, bubbles: true });
    window.dispatchEvent(event);
    return event;
  }

  function key(k: string, target: EventTarget = document.body) {
    const event = new KeyboardEvent('keydown', { key: k, cancelable: true, bubbles: true });
    target.dispatchEvent(event);
    return event;
  }

  it('swallows the wheel while locked', () => {
    renderHook(() => useScrollLock(true));

    expect(wheel().defaultPrevented).toBe(true);
  });

  it('swallows a touch drag while locked', () => {
    renderHook(() => useScrollLock(true));

    expect(touch().defaultPrevented).toBe(true);
  });

  it('leaves the wheel alone when not locked', () => {
    renderHook(() => useScrollLock(false));

    expect(wheel().defaultPrevented).toBe(false);
  });

  it('lets go when the tour ends', () => {
    const { rerender } = renderHook(({ on }) => useScrollLock(on), { initialProps: { on: true } });

    rerender({ on: false });

    expect(wheel().defaultPrevented).toBe(false);
  });

  it('lets go when unmounted, so a finished tour does not freeze the app', () => {
    const { unmount } = renderHook(() => useScrollLock(true));

    unmount();

    expect(wheel().defaultPrevented).toBe(false);
  });

  it.each(['PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp', ' '])(
    'swallows %s, which scrolls just as surely as the wheel does',
    (k) => {
      renderHook(() => useScrollLock(true));

      expect(key(k).defaultPrevented).toBe(true);
    },
  );

  /**
   * Tab and Enter are how the bubble's own buttons are reached and pressed.
   * Blocking every key would trap a keyboard user inside a tour they cannot
   * dismiss, which is a far worse bug than a scrolled page.
   */
  it.each(['Tab', 'Enter', 'Escape'])('leaves %s alone, so the bubble stays usable', (k) => {
    renderHook(() => useScrollLock(true));

    expect(key(k).defaultPrevented).toBe(false);
  });

  it('leaves the spacebar alone inside a text field, where it types a space', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    renderHook(() => useScrollLock(true));

    expect(key(' ', input).defaultPrevented).toBe(false);

    input.remove();
  });
});
