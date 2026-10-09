import { useEffect, useState } from 'react';
import { anchorSelector } from './anchors';
import { needsScroll, viewportFor } from './scroll';

/**
 * Resolving a step's target, including the case where it is not there yet.
 *
 * Every screen behind the shell is code-split, so a page tour can start before
 * the element it points at has mounted — the chunk is still in flight, or the
 * screen is waiting on its first query. A naive `querySelector` on step entry
 * returns null for a target that is two hundred milliseconds away and the step
 * silently points at nothing.
 *
 * So the hook polls, briefly, and then stops. The giving-up is the important
 * half: a tour that waits forever on an element some future refactor deleted
 * is a tour that hangs the screen it was meant to explain. `missing` is a
 * normal outcome and the engine skips the step on it.
 *
 * Polling rather than a MutationObserver because the question is "is it there
 * yet", asked a handful of times over a second and a half — an observer would
 * wake on every unrelated subtree change in a data-dense screen to answer it.
 */

export type AnchorState =
  | { status: 'none'; element: null }
  | { status: 'waiting'; element: null }
  | { status: 'found'; element: HTMLElement }
  | { status: 'missing'; element: null };

const POLL_MS = 50;
/** Long enough for a route chunk on a slow connection, short enough not to feel stuck. */
const GIVE_UP_MS = 1500;

export function useAnchor(name: string | null, timeoutMs = GIVE_UP_MS): AnchorState {
  const [state, setState] = useState<AnchorState>(() => resolve(name));

  // A step change re-resolves during render rather than in an effect, so a
  // bubble is never painted once against the previous step's target before the
  // effect catches up.
  const [lastName, setLastName] = useState(name);
  if (lastName !== name) {
    setLastName(name);
    setState(resolve(name));
  }

  // Scrolling is a side effect on the document, so it belongs in an effect and
  // not in `resolve` — which also runs during render, and so ran it twice.
  // Keyed on the element rather than the state object: a re-resolve that lands
  // on the same target must not scroll the page a second time.
  const target = state.status === 'found' ? state.element : null;
  useEffect(() => {
    if (target) reveal(target);
  }, [target]);

  useEffect(() => {
    const first = resolve(name);
    /**
     * Committed between the render and this effect — which is the ordinary
     * case, not an edge one: the tour and the screen it points at arrive in the
     * same React pass, so the target is absent while `useState` runs and
     * present by now. Adopting that result here is what stops the hook sitting
     * on `waiting` forever while a tour runs and draws nothing.
     */
    if (first.status !== 'waiting') {
      // Keeping the previous object when nothing has actually changed saves a
      // render and, with it, a second scroll onto the same target.
      // The external system here is the DOM: whether the target has been
      // committed yet is not knowable during render.
      // oxlint-disable-next-line react/set-state-in-effect
      setState((prev) =>
        prev.status === first.status && prev.element === first.element ? prev : first,
      );
      return;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const found = findVisible(name as string);
      if (found) {
        setState({ status: 'found', element: found });
        clearInterval(timer);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        // Reported as a fact, not a complaint. Whether a missing target is a
        // problem depends on what the step asked to happen — `TourStage` knows
        // that and says so; on a phone every rail anchor is legitimately absent.
        setState({ status: 'missing', element: null });
        clearInterval(timer);
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [name, timeoutMs]);

  return state;
}

/** The answer when it can be had without waiting. */
function resolve(name: string | null): AnchorState {
  if (name === null) return { status: 'none', element: null };
  const element = findVisible(name);
  return element ? { status: 'found', element } : { status: 'waiting', element: null };
}

/**
 * The *visible* element carrying this anchor, not merely the first one.
 *
 * The shell draws some controls twice — the `?` button and the mode toggle sit
 * in both the mobile top bar and the desktop strip — and hides whichever does
 * not apply at the current width. Both carry the same anchor, so a plain
 * `querySelector` hands back the hidden copy, MUI refuses to position against
 * it ("the anchor element should be part of the document layout") and the
 * spotlight collapses to a few pixels in the corner. Asking for the one that is
 * actually laid out is the whole fix, and it costs a `getClientRects` call on a
 * handful of candidates.
 */
function findVisible(name: string): HTMLElement | null {
  for (const candidate of document.querySelectorAll<HTMLElement>(anchorSelector(name))) {
    if (candidate.isConnected && isLaidOut(candidate)) return candidate;
  }
  return null;
}

/**
 * Whether an element is actually drawn — checked by walking up from it.
 *
 * The obvious test, `getClientRects().length > 0`, is the right one in a
 * browser and useless in the suite: jsdom has no layout engine, so every
 * element reports zero rects and every target would look hidden. `checkVisibility`
 * is not implemented there either. Walking ancestors reads the same answer out
 * of `getComputedStyle`, which jsdom does implement, so the rule that ships is
 * the rule the tests exercise.
 *
 * It matters that this is an ancestor walk rather than a look at the element
 * itself: the shell hides a duplicated control by putting the responsive
 * `display` on the *bar around it*, so the button's own style says `inline-flex`
 * in both copies.
 */
function isLaidOut(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

/**
 * Brings the target on screen before it is pointed at — but only if it is not
 * already comfortably there.
 *
 * `block: 'nearest'` on every step was the old behaviour and it did two unkind
 * things: it nudged targets that were already in plain view, and the ones it
 * did move it parked flush against the edge they came in from, leaving no room
 * beside them for the bubble meant to explain them. `scroll.ts` holds the rule;
 * this just obeys it.
 */
function reveal(element: HTMLElement): void {
  if (!element.scrollIntoView) return;
  const rect = element.getBoundingClientRect();
  // jsdom reports zeroes for everything, so the rule cannot be evaluated there;
  // scrolling unconditionally keeps the hook's existing tests honest about the
  // one thing they can observe, which is that it was asked to scroll at all.
  const measurable = rect.height > 0 || rect.width > 0;
  if (measurable && !needsScroll(rect, viewportFor(element))) return;
  element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
}
