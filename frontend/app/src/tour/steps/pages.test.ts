import { describe, expect, it } from 'vitest';
import { TOUR_ANCHORS, panelAnchor } from '../anchors';
import { router } from '../../app/router';
import { PAGE_TOURS, pageTourFor } from './pages';

/**
 * Every path the router knows about, read off the router itself rather than
 * written out again here. A second list would drift, and a drifting list would
 * make the "every screen" test pass while screens quietly went unexplained.
 */
const ROUTE_PATHS: string[] = (function collect(routes: readonly { path?: string; children?: readonly unknown[] }[]): string[] {
  return routes.flatMap((route) => [
    ...(route.path ? [route.path] : []),
    ...(route.children ? collect(route.children as never) : []),
  ]);
})(router.routes as never);

/**
 * A page tour answers one question — what is this screen for — and then gets
 * out of the way. The tests below are mostly about restraint: that it opens on
 * the screen's own title, that it never runs long, and that a route nobody has
 * written a sentence for simply gets no tour rather than an empty one.
 */
describe('page tours', () => {
  it('opens on the screen’s own title, so the first thing read is what the page is', () => {
    const steps = pageTourFor('/vehicles');

    expect(steps?.[0].anchor).toBe(TOUR_ANCHORS.pageTitle);
  });

  it('matches a detail route by its pattern, not its literal id', () => {
    const steps = pageTourFor('/vehicles/VEH-0042');

    expect(steps).not.toBeNull();
    expect(steps?.[0].anchor).toBe(TOUR_ANCHORS.pageTitle);
  });

  it('gives no tour to a legacy path that only redirects somewhere real', () => {
    // `/qc` exists so old links resolve; the screen it lands on explains itself.
    expect(pageTourFor('/qc')).toBeNull();
  });

  it('gives no tour to a path that is not a screen', () => {
    expect(pageTourFor('/nonsense')).toBeNull();
  });

  /**
   * Every screen explains itself, and this is what keeps that true.
   *
   * The route table is read rather than copied, so a screen added next month
   * fails here until somebody writes the sentence that says what it is for —
   * which is the only way "every screen has one" survives contact with a
   * growing app. The exclusions below are the paths that are not screens.
   */
  it('has a sentence for every screen in the route table', () => {
    const notScreens = [
      '*', // the catch-all
      '/login', // outside the shell, and nobody needs telling what it is
      // Legacy paths kept only so old links resolve; each redirects to a real
      // screen that carries its own tour.
      '/inspections',
      '/qc',
      '/service',
    ];

    const missing = ROUTE_PATHS.filter((path) => !notScreens.includes(path)).filter(
      (path) => pageTourFor(path.replace(/:\w+/g, 'SAMPLE')) === null,
    );

    expect(missing).toEqual([]);
  });

  it('reads the real route table, so the check above cannot quietly pass on nothing', () => {
    expect(ROUTE_PATHS).toContain('/dashboard');
    expect(ROUTE_PATHS.length).toBeGreaterThan(25);
  });

  it('covers the six flows the first build promised', () => {
    for (const path of [
      '/dashboard',
      '/operations/today',
      '/vehicles',
      '/riders/onboard',
      '/assignments/assign',
      '/payments/run',
    ]) {
      expect(pageTourFor(path), path).not.toBeNull();
    }
  });

  /**
   * A screen's tour walks what is actually on the screen: the about, the tile
   * strip where there is one, and then a step for each card. Twelve is a long
   * walk and still a cap — a screen with more cards than that has a layout
   * problem, not a tour problem.
   */
  it('never runs longer than twelve steps on any screen', () => {
    for (const [pattern, steps] of Object.entries(PAGE_TOURS)) {
      expect(steps.length, pattern).toBeLessThanOrEqual(12);
      expect(steps.length, pattern).toBeGreaterThan(0);
    }
  });

  it('walks the cards on a screen, not just the screen itself', () => {
    const steps = pageTourFor('/dashboard');

    expect(steps?.map((s) => s.title)).toEqual([
      'Dashboard',
      'The counts',
      'Deployments per month',
      'Service & inventory',
    ]);
  });

  it('points a card step at that card, by the label the card already carries', () => {
    const steps = pageTourFor('/dashboard') ?? [];
    const card = steps.find((s) => s.title === 'Service & inventory');

    expect(card?.anchor).toBe(panelAnchor('Service & inventory'));
  });

  /**
   * A card that is only on screen sometimes — the bulk upload preview before a
   * file is chosen, a rider's bike when they hold one — must not strand the
   * tour on a target that is not there.
   */
  it('lets a card step be skipped when its card is not on screen', () => {
    for (const [pattern, steps] of Object.entries(PAGE_TOURS)) {
      for (const step of steps.filter((s) => s.anchor?.startsWith('panel:'))) {
        expect(step.onMissing ?? 'skip', `${pattern} — ${step.id}`).toBe('skip');
      }
    }
  });

  it('describes every card it names', () => {
    for (const [pattern, steps] of Object.entries(PAGE_TOURS)) {
      for (const step of steps) {
        expect(step.body.trim().length, `${pattern} — ${step.id}`).toBeGreaterThan(20);
      }
    }
  });

  /**
   * Two kinds of step, two budgets.
   *
   * The first step of a screen is its *about*: it has to say what the screen
   * is, what is on it and what you do here, so a dozen words cannot carry it.
   * Everything after it points at one control and should stay a caption. The
   * cap on the about is still a cap — a screen needing more than sixty words
   * has a tour that has turned into a manual.
   */
  it('gives every screen an about step that actually describes it', () => {
    for (const [pattern, steps] of Object.entries(PAGE_TOURS)) {
      const about = steps[0];
      expect(about.wide, `${pattern} — the about step must be given room`).toBe(true);
      const words = about.body.split(/\s+/).length;
      expect(words, `${pattern} — about is too thin to be a description`).toBeGreaterThanOrEqual(20);
      expect(words, `${pattern} — about has become a manual`).toBeLessThanOrEqual(60);
    }
  });

  /**
   * Every step on a screen now describes something — the screen, the tiles, or
   * one card — so they share one budget. Sixty words is still a cap: past that
   * a step has stopped describing a card and started documenting it.
   */
  it('keeps every step inside one readable paragraph', () => {
    for (const [pattern, steps] of Object.entries(PAGE_TOURS)) {
      for (const step of steps) {
        const words = step.body.split(/\s+/).length;
        expect(words, `${pattern} — ${step.id} is too thin`).toBeGreaterThanOrEqual(15);
        expect(words, `${pattern} — ${step.id} has become a manual`).toBeLessThanOrEqual(60);
        expect(step.wide, `${pattern} — ${step.id} needs room`).toBe(true);
      }
    }
  });

  it('points every step at an anchor the app actually declares', () => {
    const declared: string[] = Object.values(TOUR_ANCHORS);

    for (const [pattern, steps] of Object.entries(PAGE_TOURS)) {
      for (const step of steps) {
        if (step.anchor === null) continue;
        // A card's anchor is derived from its own label by `Panel`, so it is
        // declared by construction rather than listed.
        if (step.anchor.startsWith('panel:')) continue;
        expect(declared, `${pattern} — ${step.id}`).toContain(step.anchor);
      }
    }
  });

  it('gives every step on a screen a distinct id', () => {
    for (const [pattern, steps] of Object.entries(PAGE_TOURS)) {
      const ids = steps.map((step) => step.id);
      expect(new Set(ids).size, pattern).toBe(ids.length);
    }
  });

  it('prefers the more specific route when two patterns could match', () => {
    // `/riders/onboard` must not be served the `/riders/:riderId` tour.
    const steps = pageTourFor('/riders/onboard');

    expect(steps?.[0].id).toBe('riders/onboard:what');
  });

  /**
   * These two sit under `/vehicles/:vehicleId` and were being told they were a
   * bike's record — "its whole life: riders, services, payments" on the screen
   * for adding a bike that does not exist yet. A literal segment has to beat a
   * placeholder, and nothing was asserting it for this pair.
   */
  it('does not mistake the add-vehicle screen for a bike record', () => {
    expect(pageTourFor('/vehicles/new')?.[0].id).toBe('vehicles/new:what');
  });

  it('does not mistake the bulk upload screen for a bike record', () => {
    expect(pageTourFor('/vehicles/bulk-upload')?.[0].id).toBe('vehicles/bulk-upload:what');
  });

  it('still serves a real bike id the record tour', () => {
    expect(pageTourFor('/vehicles/BLRSS0428')?.[0].id).toBe('vehicles/:vehicleId:what');
  });
});
