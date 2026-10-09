import { matchPath } from 'react-router-dom';
import { TOUR_ANCHORS } from '../anchors';
import type { TourStep } from './platform';

/**
 * What each screen is for, in a sentence.
 *
 * This is the file you edit to cover a screen — the engine needs no change to
 * learn a new one. Every tour opens on the screen's own title, because the
 * question a first-time operator has on arriving somewhere is "what is this",
 * and `PageHeader` is on all twenty-six screens, so that step costs nothing per
 * page. Anything after it points at a shared component, which is why six flows
 * are covered here without a single page file importing the tour.
 *
 * Three steps is the ceiling and a test enforces it. A screen that seems to
 * need four is a screen whose tour has turned into a manual.
 */

const tours: Record<string, TourStep[]> = {
  '/dashboard': [
    {
      id: 'dashboard:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Dashboard',
      body: 'The fleet at a glance. Where the bikes are, right now.',
    },
    {
      id: 'dashboard:tiles',
      anchor: TOUR_ANCHORS.statTiles,
      title: 'Start here',
      body: 'Each tile is a count. Read them every morning.',
    },
  ],

  '/operations/today': [
    {
      id: 'operations/today:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: "Today's operations",
      body: 'Everything due today, in one list. Work top to bottom.',
    },
    {
      id: 'operations/today:tiles',
      anchor: TOUR_ANCHORS.statTiles,
      title: 'The counts',
      body: 'How much is waiting, before you open any of it.',
    },
  ],

  '/vehicles': [
    {
      id: 'vehicles:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Vehicles',
      body: 'Every bike you own, and who is on it.',
    },
    {
      id: 'vehicles:search',
      anchor: TOUR_ANCHORS.search,
      title: 'Find one',
      body: 'Search by registration, model, or the rider holding it.',
    },
    {
      id: 'vehicles:facets',
      anchor: TOUR_ANCHORS.facets,
      title: 'Or filter',
      body: 'Narrow by status without typing anything.',
    },
  ],

  '/vehicles/:vehicleId': [
    {
      id: 'vehicles/detail:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'One bike',
      body: 'Its whole life: riders, services, payments, history.',
    },
  ],

  '/riders': [
    {
      id: 'riders:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Riders',
      body: 'Everyone on your register. Active riders are holding a bike.',
    },
    {
      id: 'riders:facets',
      anchor: TOUR_ANCHORS.facets,
      title: 'Active or inactive',
      body: 'Inactive means on the register, without a bike.',
    },
  ],

  '/riders/:riderId': [
    {
      id: 'riders/detail:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'One rider',
      body: 'Their bike, their payments, and everything they have done.',
    },
  ],

  '/riders/onboard': [
    {
      id: 'riders/onboard:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Onboard rider',
      body: 'Put someone new on the register. It does not assign a bike.',
    },
    {
      id: 'riders/onboard:order',
      anchor: TOUR_ANCHORS.firstStep,
      title: 'Any order',
      body: 'Fill the sections however the rider tells you.',
    },
  ],

  '/assignments/assign': [
    {
      id: 'assignments/assign:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Assign vehicle',
      body: 'Hand a bike to a rider. One rider, one bike.',
    },
  ],

  '/payments/run': [
    {
      id: 'payments/run:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Weekly payment run',
      body: "This week's collections, rider by rider. Record what came in.",
    },
    {
      id: 'payments/run:tiles',
      anchor: TOUR_ANCHORS.statTiles,
      title: 'Running totals',
      body: 'These move as you record each payment.',
    },
  ],
  // ── Fleet ────────────────────────────────────────────────────────────────
  '/vehicles/new': [
    {
      id: 'vehicles/new:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Add vehicle',
      body: 'Induct one bike. For a whole spreadsheet, use bulk upload.',
    },
  ],

  '/vehicles/bulk-upload': [
    {
      id: 'vehicles/bulk-upload:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Bulk upload',
      body: 'Bring in a spreadsheet of bikes. You see a preview before anything saves.',
    },
  ],

  '/vehicles/:vehicleId/edit': [
    {
      id: 'vehicles/edit:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Edit vehicle',
      body: "Correct a bike's record. Its history cannot be edited.",
    },
  ],

  // ── Service management ───────────────────────────────────────────────────
  '/service/queues': [
    {
      id: 'service/queues:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Bikes in service',
      body: 'Every bike off the road, and the stage it has reached.',
    },
  ],

  '/service/qc': [
    {
      id: 'service/qc:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'QC queue',
      body: 'Bikes waiting to be signed off before they go out again.',
    },
  ],

  '/service/inspection': [
    {
      id: 'service/inspection:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Inspection',
      body: 'Record what you found on a bike, point by point.',
    },
  ],

  '/service/assistance': [
    {
      id: 'service/assistance:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Help desk',
      body: 'Riders who called for help. Open jobs sit at the top.',
    },
  ],

  '/service/assistance/new': [
    {
      id: 'service/assistance/new:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'New help job',
      body: "Log a rider's problem and who is going out to it.",
    },
  ],

  '/service/assistance/:jobId': [
    {
      id: 'service/assistance/detail:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'One help job',
      body: 'What was reported, what was done, and where it stands.',
    },
  ],

  // ── Riders ───────────────────────────────────────────────────────────────
  '/assignments/exchange': [
    {
      id: 'assignments/exchange:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Exchange vehicle',
      body: 'Move a rider onto a different bike. The old one comes back.',
    },
  ],

  '/assignments/deboard': [
    {
      id: 'assignments/deboard:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Deboard rider',
      body: "Take the bike back and close the rider's time on it.",
    },
  ],

  // ── Money ────────────────────────────────────────────────────────────────
  '/payments/run/:riderId': [
    {
      id: 'payments/receipt:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Receipt',
      body: "One rider's week: what was due, and what came in.",
    },
  ],

  '/payments/overdue': [
    {
      id: 'payments/overdue:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Overdue riders',
      body: 'Who is behind on rent, and by how much.',
    },
    {
      id: 'payments/overdue:tiles',
      anchor: TOUR_ANCHORS.statTiles,
      title: 'The damage',
      body: 'What is outstanding in total, before you open anyone.',
    },
  ],

  '/recovery': [
    {
      id: 'recovery:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Recovery',
      body: 'Money chased after a rider left, and what came back.',
    },
  ],

  // ── Admin ────────────────────────────────────────────────────────────────
  '/users': [
    {
      id: 'users:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Users & roles',
      body: 'Who can sign in, and what each of them is allowed to do.',
    },
  ],

  '/audit': [
    {
      id: 'audit:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Audit log',
      body: 'Every change anyone made, with their name against it.',
    },
  ],

  '/design-tokens': [
    {
      id: 'design-tokens:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Design tokens',
      body: 'The colours and type the app is built from. Tooling, not product.',
    },
  ],

  '/flows': [
    {
      id: 'flows:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Flows',
      body: 'How a bike moves from one state to the next, drawn out.',
    },
  ],
};


export const PAGE_TOURS = tours;

/**
 * Patterns longest and least wildcard-y first, so `/riders/onboard` is never
 * served the `/riders/:riderId` tour. Same trick, and same reason, as the
 * `GATED_ROUTES` ordering in `app/nav.ts`.
 */
const RANKED = Object.keys(tours).sort((a, b) => {
  const dynamic = (p: string) => p.split('/').filter((s) => s.startsWith(':')).length;
  if (dynamic(a) !== dynamic(b)) return dynamic(a) - dynamic(b);
  return b.split('/').length - a.split('/').length;
});

/** The tour for a screen, or null for one nobody has written a sentence for yet. */
export function pageTourFor(pathname: string): TourStep[] | null {
  for (const pattern of RANKED) {
    if (matchPath({ path: pattern, end: true }, pathname)) return tours[pattern];
  }
  return null;
}
