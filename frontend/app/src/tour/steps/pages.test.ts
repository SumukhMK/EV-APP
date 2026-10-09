import { describe, expect, it } from 'vitest';
import { TOUR_ANCHORS } from '../anchors';
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

  it('never runs longer than three steps on any screen', () => {
    for (const [pattern, steps] of Object.entries(PAGE_TOURS)) {
      expect(steps.length, pattern).toBeLessThanOrEqual(3);
      expect(steps.length, pattern).toBeGreaterThan(0);
    }
  });

  it('keeps every line short enough to read at a glance', () => {
    for (const [pattern, steps] of Object.entries(PAGE_TOURS)) {
      for (const step of steps) {
        expect(step.body.split(/\s+/).length, `${pattern} — ${step.id}`).toBeLessThanOrEqual(14);
      }
    }
  });

  it('points every step at an anchor the app actually declares', () => {
    const declared: string[] = Object.values(TOUR_ANCHORS);

    for (const [pattern, steps] of Object.entries(PAGE_TOURS)) {
      for (const step of steps) {
        if (step.anchor === null) continue;
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
    expect(pageTourFor('/vehicles/BLRSS0428')?.[0].id).toBe('vehicles/detail:what');
  });
});
