import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTargetRect } from './useTargetRect';

/**
 * The bug this hook exists to kill.
 *
 * The spotlight used to read its target's rect once, during render, and write
 * the numbers out as fixed coordinates. Then the tour smooth-scrolled the rail
 * to bring the next section into view, the section slid 130 pixels up, and the
 * ring stayed where it was — drawn around "Sign out" while the bubble beside it
 * talked about Money. The bubble looked right the whole time because Popper
 * repositions itself on scroll; nothing repositioned the ring.
 *
 * Anything that moves the target has to move the ring: a smooth scroll in
 * flight, the user scrolling mid-step, the rail collapsing, a window resize.
 * Watching the rect every frame covers all four without having to enumerate
 * them, which is the point.
 */
describe('useTargetRect', () => {
  let frame: FrameRequestCallback | null = null;

  beforeEach(() => {
    // A hand-cranked rAF, so a test can advance exactly one frame at a time.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frame = null;
    });
  });

  afterEach(() => {
    frame = null;
    vi.unstubAllGlobals();
  });

  const tick = () =>
    act(() => {
      frame?.(0);
    });

  function elementAt(top: number) {
    const el = document.createElement('div');
    let rect = { top, left: 0, width: 100, height: 50, right: 100, bottom: top + 50 };
    el.getBoundingClientRect = () => rect as DOMRect;
    return {
      el,
      moveTo(next: number) {
        rect = { ...rect, top: next, bottom: next + 50 };
      },
    };
  }

  it('reports where the target is on first look', () => {
    const { el } = elementAt(100);

    const { result } = renderHook(() => useTargetRect(el));

    expect(result.current?.top).toBe(100);
  });

  it('reports nothing when there is no target', () => {
    const { result } = renderHook(() => useTargetRect(null));

    expect(result.current).toBeNull();
  });

  it('follows the target when it moves — the whole reason this exists', () => {
    const { el, moveTo } = elementAt(663);
    const { result } = renderHook(() => useTargetRect(el));

    moveTo(536);
    tick();

    expect(result.current?.top).toBe(536);
  });

  it('keeps following across several frames of a smooth scroll', () => {
    const { el, moveTo } = elementAt(663);
    const { result } = renderHook(() => useTargetRect(el));

    for (const top of [640, 600, 560, 536]) {
      moveTo(top);
      tick();
    }

    expect(result.current?.top).toBe(536);
  });

  it('does not re-render while the target sits still', () => {
    const { el } = elementAt(100);
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useTargetRect(el);
    });
    const before = renders;

    tick();
    tick();

    expect(renders).toBe(before);
  });

  it('stops watching once unmounted, leaving no frame loop behind', () => {
    const { el } = elementAt(100);
    const { unmount } = renderHook(() => useTargetRect(el));

    unmount();

    expect(frame).toBeNull();
  });

  it('switches to a new target when the step moves on', () => {
    const first = elementAt(100);
    const second = elementAt(400);
    const { result, rerender } = renderHook(({ el }) => useTargetRect(el), {
      initialProps: { el: first.el },
    });

    rerender({ el: second.el });

    expect(result.current?.top).toBe(400);
  });
});
