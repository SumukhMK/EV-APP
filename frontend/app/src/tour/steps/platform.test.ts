import { describe, expect, it } from 'vitest';
import { NAV } from '../../app/nav';
import { TOUR_ANCHORS } from '../anchors';
import { PLATFORM_STEPS, stepsForRole } from './platform';

/**
 * The platform tour is the answer to "how do I move around this thing", so the
 * thing it must never do is point at a part of the rail the signed-in role
 * cannot see. A service manager has no Riders, Money or Admin sections; a step
 * about them is not a small cosmetic bug, it is the tour teaching a navigation
 * that does not exist for that user.
 */
describe('platform tour', () => {
  it('shows every section to a super admin', () => {
    const headings = stepsForRole(PLATFORM_STEPS, 'SUPER_ADMIN')
      .map((step) => step.section)
      .filter(Boolean);

    expect(headings).toEqual(['Operations', 'Fleet', 'Service management', 'Riders', 'Money', 'Admin']);
  });

  it('never mentions riders, money or admin to a service manager', () => {
    const headings = stepsForRole(PLATFORM_STEPS, 'SERVICE_MANAGER')
      .map((step) => step.section)
      .filter(Boolean);

    expect(headings).toEqual(['Operations', 'Fleet', 'Service management']);
  });

  it('shows fleet staff the riders section but not money or admin', () => {
    const headings = stepsForRole(PLATFORM_STEPS, 'FLEET_STAFF')
      .map((step) => step.section)
      .filter(Boolean);

    expect(headings).toEqual(['Operations', 'Fleet', 'Service management', 'Riders']);
  });

  it('keeps the welcome and the sign-off for every role', () => {
    for (const role of ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_STAFF', 'SERVICE_MANAGER'] as const) {
      const ids = stepsForRole(PLATFORM_STEPS, role).map((step) => step.id);
      expect(ids[0]).toBe('welcome');
      expect(ids[ids.length - 1]).toBe('help');
    }
  });

  it('has a step for every section the rail can show', () => {
    const stepSections = PLATFORM_STEPS.map((step) => step.section).filter(Boolean);

    expect(stepSections).toEqual(NAV.map((section) => section.heading));
  });

  it('points every step at an anchor the app actually declares', () => {
    const declared = Object.values(TOUR_ANCHORS);

    for (const step of PLATFORM_STEPS) {
      if (step.anchor === null) continue;
      expect(declared).toContain(step.anchor);
    }
  });

  it('gives every step a distinct id, so progress cannot collide', () => {
    const ids = PLATFORM_STEPS.map((step) => step.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Below `md` the rail is a closed drawer, so none of its sections are in the
   * document and every step after the welcome resolves to nothing. Skipping
   * them — the right answer for a control that has genuinely gone — turned the
   * whole tour into a single card on a phone. These steps carry words worth
   * reading with or without something to point at, so they say so.
   */
  it('still has something to say when there is nothing to point at', () => {
    for (const step of PLATFORM_STEPS) {
      expect(step.onMissing, step.id).toBe('card');
    }
  });

  it('keeps every body short enough to read at a glance', () => {
    for (const step of PLATFORM_STEPS) {
      expect(step.body.split(/\s+/).length).toBeLessThanOrEqual(12);
    }
  });
});
