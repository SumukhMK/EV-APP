import { NAV } from '../../app/nav';
import type { UserRole } from '../../types';
import { TOUR_ANCHORS, navAnchor } from '../anchors';

/**
 * The tour that answers "how do I move around FleeTech".
 *
 * One pass down the rail, one line per section. Nine steps is more than the
 * four a tour usually survives, but these are not nine contexts — eight of them
 * are the same rail with the highlight moving down it, which reads as a list
 * being walked rather than nine separate interruptions. The copy is held to a
 * dozen words a step by a test, because the moment a step needs a paragraph it
 * has stopped being orientation and started being documentation.
 */

export interface TourStep {
  /** Stable across copy edits — progress and tests key off it. */
  id: string;
  /** A name from `TOUR_ANCHORS`, or null for a centred card with no target. */
  anchor: string | null;
  /**
   * The nav section this step is about, when it is about one. Its presence is
   * what makes the step role-gated: `stepsForRole` reads the roles straight off
   * `NAV`, so hiding a section from a role and hiding its tour step are the
   * same edit and cannot drift apart.
   */
  section?: string;
  title?: string;
  body: string;
  /**
   * What to do when the target cannot be found.
   *
   * `skip` (the default) is right for a step that only makes sense beside its
   * control — a missing one means the control has gone, and pointing at nothing
   * helps nobody. `card` is right for a step whose words stand on their own:
   * below `md` the rail is a closed drawer, so every section step resolves to
   * nothing, and skipping them reduced the whole platform tour on a phone to
   * its welcome card.
   */
  onMissing?: 'skip' | 'card';
}

/** One step per nav section, in rail order, so a new section gets a step for free. */
const SECTION_BODIES: Record<string, string> = {
  Operations: 'What needs doing today.',
  Fleet: 'Your bikes. Add them, find one, check its record.',
  'Service management': 'Bikes off the road. Repairs, QC, help desk.',
  Riders: 'People on your bikes. Onboard, assign, exchange, deboard.',
  Money: 'Weekly collections, who is overdue, what came back.',
  Admin: 'Who can use FleeTech, and what everyone did.',
};

export const PLATFORM_STEPS: TourStep[] = [
  {
    id: 'welcome',
    anchor: null,
    onMissing: 'card',
    title: 'FleeTech runs your fleet.',
    body: 'The bikes, the riders, and the money.',
  },
  {
    id: 'rail',
    anchor: TOUR_ANCHORS.rail,
    onMissing: 'card',
    title: 'Everything is here',
    body: 'Six groups, top to bottom.',
  },
  ...NAV.map((section) => ({
    id: `section:${section.heading}`,
    anchor: navAnchor(section.heading),
    onMissing: 'card' as const,
    section: section.heading,
    title: section.heading,
    body: SECTION_BODIES[section.heading] ?? '',
  })),
  {
    id: 'help',
    anchor: TOUR_ANCHORS.help,
    onMissing: 'card',
    title: 'Lost?',
    body: 'Replay this anytime.',
  },
];

/**
 * The steps a role may be shown, in order.
 *
 * A step with no `section` is scaffolding — the welcome, the rail, the sign-off
 * — and belongs to everyone. A step about a section lives or dies with that
 * section's own `roles`, which is why this reads `NAV` rather than carrying its
 * own copy of the rules.
 *
 * Filtering happens before the engine counts steps, so "3 of 6" is true for a
 * service manager rather than counting three steps they will never reach.
 */
export function stepsForRole(steps: TourStep[], role: UserRole): TourStep[] {
  return steps.filter((step) => {
    if (!step.section) return true;
    const section = NAV.find((candidate) => candidate.heading === step.section);
    return section ? section.roles.includes(role) : false;
  });
}
