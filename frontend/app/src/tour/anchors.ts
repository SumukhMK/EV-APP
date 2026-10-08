import { NAV } from '../app/nav';

/**
 * Where a tour step is allowed to point.
 *
 * Steps name a target by string and the engine queries the DOM for it, rather
 * than threading refs up from six components into a provider. The targets live
 * on either side of a code-split boundary — the rail is in the shell, a page
 * title arrives with its chunk — and a ref-based contract would mean every
 * screen importing the tour just to hand it a node. An attribute lets a
 * component say "I am the Money section" and know nothing else.
 *
 * The cost of a stringly-typed contract is drift, and this file is the payment:
 * both the steps and the components spread `tourAnchor(...)` from the same map,
 * and `platform.test.ts` fails if a step ever points somewhere undeclared.
 */

/** The rail's anchor for one nav section, derived so a new section cannot be forgotten. */
export function navAnchor(heading: string): string {
  return `nav:${heading}`;
}

export const TOUR_ANCHORS = {
  /** The navigation rail as a whole. */
  rail: 'rail',
  /** The `?` button in the top-right strip. */
  help: 'help',
  /** The title in `PageHeader` — present on all twenty-six screens, which is
   *  what lets every page carry a "what is this for" step with no page code. */
  pageTitle: 'page-title',
  /**
   * The five below hang off shared components rather than individual screens,
   * which is where this approach earns its keep: one attribute on `StatTiles`
   * gives the dashboard, today's operations, the payment run and the overdue
   * list a second step each, and no page file learns that a tour exists.
   */
  pageActions: 'page-actions',
  statTiles: 'stat-tiles',
  search: 'search',
  facets: 'facets',
  /** The first numbered section of a long form. */
  firstStep: 'first-step',
  ...Object.fromEntries(NAV.map((section) => [section.heading, navAnchor(section.heading)])),
} as const satisfies Record<string, string>;

/**
 * Spread onto the element a step points at: `<Box {...tourAnchor(TOUR_ANCHORS.rail)}>`.
 *
 * A function rather than a bare attribute so the call sites read as a
 * declaration and so the attribute name lives in exactly one place.
 */
export function tourAnchor(name: string): { 'data-tour': string } {
  return { 'data-tour': name };
}

/** The selector the engine hands to `querySelector`. */
export function anchorSelector(name: string): string {
  return `[data-tour="${CSS.escape(name)}"]`;
}
