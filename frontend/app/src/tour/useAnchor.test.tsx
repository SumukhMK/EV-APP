import { act, render, renderHook, screen } from '@testing-library/react';
import { createElement, Fragment } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourAnchor } from './anchors';
import { useAnchor } from './useAnchor';

/**
 * Every screen behind the shell is code-split, so a step can point at an
 * element whose chunk is still in flight. The rule the whole engine rests on:
 * a late target is waited for, a target that never comes is given up on, and
 * neither one is allowed to leave the tour hanging on a spinner forever.
 */
describe('useAnchor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  function mount(name: string) {
    const el = document.createElement('div');
    el.setAttribute('data-tour', tourAnchor(name)['data-tour']);
    document.body.appendChild(el);
    return el;
  }

  it('reports no target for a step that wants a centred card', () => {
    const { result } = renderHook(() => useAnchor(null));

    expect(result.current.status).toBe('none');
  });

  it('finds a target that is already on the page', () => {
    const el = mount('rail');

    const { result } = renderHook(() => useAnchor('rail'));

    expect(result.current.status).toBe('found');
    expect(result.current.element).toBe(el);
  });

  it('waits for a target whose chunk has not arrived yet', () => {
    const { result } = renderHook(() => useAnchor('page-title'));
    expect(result.current.status).toBe('waiting');

    const el = mount('page-title');
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.status).toBe('found');
    expect(result.current.element).toBe(el);
  });

  it('gives up on a target that never arrives, rather than waiting forever', () => {
    const { result } = renderHook(() => useAnchor('never-rendered'));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.status).toBe('missing');
  });

  it('is still waiting just before it gives up', () => {
    const { result } = renderHook(() => useAnchor('never-rendered'));

    act(() => {
      vi.advanceTimersByTime(1400);
    });

    expect(result.current.status).toBe('waiting');
  });

  it('starts over when the step moves to a different target', () => {
    mount('rail');
    const { result, rerender } = renderHook(({ name }) => useAnchor(name), {
      initialProps: { name: 'rail' },
    });
    expect(result.current.status).toBe('found');

    rerender({ name: 'help' });

    expect(result.current.status).toBe('waiting');
  });

  it('stops polling once unmounted, so a finished tour leaves no timer behind', () => {
    const { unmount } = renderHook(() => useAnchor('never-rendered'));

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  /**
   * The shell renders some controls twice — once in the mobile top bar, once in
   * the desktop strip — and hides whichever does not apply. Both carry the same
   * anchor, so a plain `querySelector` finds the hidden one and MUI refuses to
   * position against it ("the anchor element should be part of the document
   * layout"). The tour must point at the copy the user can actually see.
   */
  it('ignores a hidden copy of a target and takes the visible one', () => {
    const hidden = mount('help');
    hidden.style.display = 'none';
    const visible = mount('help');

    const { result } = renderHook(() => useAnchor('help'));

    expect(result.current.element).toBe(visible);
  });

  it('keeps waiting while the only copy of a target is hidden', () => {
    const hidden = mount('help');
    hidden.style.display = 'none';

    const { result } = renderHook(() => useAnchor('help'));

    expect(result.current.status).toBe('waiting');
  });

  /**
   * How the shell actually hides the copy it is not using: the control itself
   * is an ordinary visible button, and the *bar around it* carries the
   * responsive `display`. Checking the element's own style misses this
   * entirely, which is the bug that made the tour spotlight an 8px sliver in
   * the corner on the last step.
   */
  it('ignores a copy hidden by an ancestor, not just by its own style', () => {
    const mobileBar = document.createElement('div');
    mobileBar.style.display = 'none';
    const hidden = document.createElement('div');
    hidden.setAttribute('data-tour', 'help');
    mobileBar.appendChild(hidden);
    document.body.appendChild(mobileBar);
    const visible = mount('help');

    const { result } = renderHook(() => useAnchor('help'));

    expect(result.current.element).toBe(visible);
  });

  it('takes a copy that becomes visible after the layout settles', () => {
    const el = mount('help');
    el.style.display = 'none';
    const { result } = renderHook(() => useAnchor('help'));

    el.style.display = 'block';
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.element).toBe(el);
  });

  /**
   * The rail scrolls. Admin is the last section in it and sits below the fold
   * on a short window, so without this the tour highlights a region nobody can
   * see and parks the bubble off-screen beside it.
   */
  it('scrolls a target into view, so the tour never points off-screen', () => {
    const el = mount('rail');
    const scrollIntoView = vi.fn();
    el.scrollIntoView = scrollIntoView;

    renderHook(() => useAnchor('rail'));

    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  /**
   * The case the other tests all miss, because they put the target in the
   * document before rendering the hook. In the running app the target is
   * committed by React in the *same pass* as the tour: absent while the hook
   * renders, present by the time its effect runs. An effect that only starts
   * polling — and does not re-check — leaves the hook stuck on `waiting`
   * forever, which is a tour that is running and drawing nothing.
   */
  it('settles on a target that lands between the render and the effect', () => {
    function Harness() {
      const anchor = useAnchor('page-title');
      return createElement(
        Fragment,
        null,
        createElement('div', { 'data-tour': 'page-title' }),
        createElement('span', { 'data-testid': 'status' }, anchor.status),
      );
    }

    render(createElement(Harness));

    expect(screen.getByTestId('status')).toHaveTextContent('found');
  });

  it('scrolls a late-arriving target into view too', () => {
    const { result } = renderHook(() => useAnchor('page-title'));
    expect(result.current.status).toBe('waiting');

    const el = mount('page-title');
    const scrollIntoView = vi.fn();
    el.scrollIntoView = scrollIntoView;
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(scrollIntoView).toHaveBeenCalledOnce();
  });
});
