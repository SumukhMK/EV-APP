import { describe, expect, it } from 'vitest';
import { TOUR_ANCHORS } from '../anchors';
import { PAGE_TOURS, pageTourFor } from './pages';

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

  it('gives no tour at all to a screen nobody has written a sentence for', () => {
    expect(pageTourFor('/design-tokens')).toBeNull();
  });

  it('gives no tour to a path that is not a screen', () => {
    expect(pageTourFor('/nonsense')).toBeNull();
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
});
