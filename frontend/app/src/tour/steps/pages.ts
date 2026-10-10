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
      wide: true,
      body:
        "The fleet at a glance: how many bikes you own, how many are out earning, and how many are off the road. Below the counts, deployments month by month and a service and inventory summary. It is a read — nothing here changes anything.",
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
      wide: true,
      body:
        "What needs doing today, in one place: where the bikes are now, how they have moved, how they came in for service, and how busy each hub is. Click any number to see exactly which bikes it counts.",
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
      wide: true,
      body:
        "Every bike you own, one row each, with its registration, model, hub, state and the rider holding it. Search or filter to find one, then open a row for its full record. New bikes are added from here too, singly or from a spreadsheet.",
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
      wide: true,
      body:
        "One bike's whole life: its specification, every rider who has held it, every service it has been through, and the lifecycle events that moved it between states. Nothing here is editable — this is the record, and corrections are made on the edit screen.",
    },
  ],

  '/riders': [
    {
      id: 'riders:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Riders',
      wide: true,
      body:
        "Everyone on your register. Active riders are holding a bike right now; inactive riders are on the books without one. Search by name or phone, filter by status, and open anyone for their full record.",
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
      wide: true,
      body:
        "One rider's record: who they are and how to reach them, the bike they hold, what they have paid and what they owe, and every assignment, exchange and deboarding they have been through.",
    },
  ],

  '/riders/onboard': [
    {
      id: 'riders/onboard:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Onboard rider',
      wide: true,
      body:
        "Put a new rider on the register: who they are, how to reach them, where they live, and the commercial terms agreed. The sections can be filled in any order, so take them as the rider gives them. This does not hand over a bike — assign one afterwards.",
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
      wide: true,
      body:
        "Hand a bike to a rider who does not have one. Pick the rider, pick an available bike, confirm. A rider holds one bike at a time, so only riders who are waiting and bikes that are ready to deploy appear here.",
    },
  ],

  '/payments/run': [
    {
      id: 'payments/run:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Weekly payment run',
      wide: true,
      body:
        "This week's collections, rider by rider: what each one owes and what has come in. Record payments as they are taken and the totals at the top move with you. Open a rider for the receipt behind their line.",
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
      wide: true,
      body:
        "Induct one bike into the fleet: its identity and chassis number, make and model, battery, the devices fitted to it, and the hub it belongs to. For a whole spreadsheet of bikes at once, use bulk upload instead.",
    },
  ],

  '/vehicles/bulk-upload': [
    {
      id: 'vehicles/bulk-upload:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Bulk upload',
      wide: true,
      body:
        "Bring a spreadsheet of bikes in at once. The file is checked first — you see which columns were recognised, which are missing, and a row-by-row preview of what will be created. Nothing is saved until you confirm, and only clean rows are imported.",
    },
  ],

  '/vehicles/:vehicleId/edit': [
    {
      id: 'vehicles/edit:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Edit vehicle',
      wide: true,
      body:
        "Correct a bike's record: make, model, battery, devices, hub. Only the fields that describe the bike can be changed. Its services, its assignments and its history are a record of what happened and cannot be edited here.",
    },
  ],

  // ── Service management ───────────────────────────────────────────────────
  '/service/queues': [
    {
      id: 'service/queues:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Bikes in service',
      wide: true,
      body:
        "Every bike that is off the road, and the stage it has reached. Filter by queue, status or hub to look at one part of the workshop at a time. Open a job to see what was reported and what has been done to it.",
    },
  ],

  '/service/qc': [
    {
      id: 'service/qc:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'QC queue',
      wide: true,
      body:
        "Bikes that have been worked on and are waiting to be signed off before they go back out. This is the last gate: a bike passes and returns to the fleet, or it fails and goes back to the workshop.",
    },
  ],

  '/service/inspection': [
    {
      id: 'service/inspection:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Inspection',
      wide: true,
      body:
        "Record what you found on a bike, point by point. The result decides which queue the bike goes to next, so it is worth filling in from the bike in front of you rather than from memory.",
    },
  ],

  '/service/assistance': [
    {
      id: 'service/assistance:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Help desk',
      wide: true,
      body:
        "Riders who called for help, with what was reported, how the bike reached you, and where each job has got to. Filter by status, source or hub to narrow it down, or start a new job from here.",
    },
  ],

  '/service/assistance/new': [
    {
      id: 'service/assistance/new:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'New help job',
      wide: true,
      body:
        "Log a rider's problem and get it moving: what happened, which bike, how bad the damage is, and how the bike reached you. Those answers decide which queue the job lands in, so they are worth getting right.",
    },
  ],

  '/service/assistance/:jobId': [
    {
      id: 'service/assistance/detail:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'One help job',
      wide: true,
      body:
        "One help job end to end: what the rider reported, how the bike came in, everything done to it so far, and the quality check that closes it. The job is moved to its next stage from here.",
    },
  ],

  // ── Riders ───────────────────────────────────────────────────────────────
  '/assignments/exchange': [
    {
      id: 'assignments/exchange:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Exchange vehicle',
      wide: true,
      body:
        "Move a rider from the bike they hold onto a different one — a swap, not a second bike. The old bike comes back into the fleet and goes wherever its condition sends it. Only riders currently holding a bike appear here.",
    },
  ],

  '/assignments/deboard': [
    {
      id: 'assignments/deboard:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Deboard rider',
      wide: true,
      body:
        "Take the bike back and close a rider's time on it. The bike returns to the fleet; the rider stays on the register as inactive, so their history is kept. Only riders currently holding a bike appear here.",
    },
  ],

  // ── Money ────────────────────────────────────────────────────────────────
  '/payments/run/:riderId': [
    {
      id: 'payments/receipt:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Receipt',
      wide: true,
      body:
        "One rider's week in detail: who they are, what they were charged and why, and the payment recorded against it. This is the receipt sitting behind a single line in the weekly payment run.",
    },
  ],

  '/payments/overdue': [
    {
      id: 'payments/overdue:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Overdue riders',
      wide: true,
      body:
        "Who is behind on rent and by how much, worst first. The totals at the top say how much is outstanding across the whole fleet before you open anyone. Use it to decide who to chase today.",
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
      wide: true,
      body:
        "Money and bikes chased after a rider has gone: what still needs recovering, what has come back, and which vehicles are missing. The tail end of a rental, kept visible so it does not get forgotten.",
    },
  ],

  // ── Admin ────────────────────────────────────────────────────────────────
  '/users': [
    {
      id: 'users:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Users & roles',
      wide: true,
      body:
        "Everyone who can sign in to FleeTech and what each of them is allowed to do. Add an account, change a role, or disable someone who has left. The roles panel explains what each role can reach — worth reading before handing one out.",
    },
  ],

  '/audit': [
    {
      id: 'audit:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Audit log',
      wide: true,
      body:
        "Every change anyone has made, newest first, with their name against it: who did what, to which record, and when. Nothing here can be edited or removed, which is rather the point of keeping it.",
    },
  ],

  '/design-tokens': [
    {
      id: 'design-tokens:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Design tokens',
      wide: true,
      body:
        "The colours, type and spacing the whole app is built from, shown in both light and dark. Tooling rather than product: it exists so a change to the palette can be judged in one place instead of screen by screen.",
    },
  ],

  '/flows': [
    {
      id: 'flows:what',
      anchor: TOUR_ANCHORS.pageTitle,
      title: 'Flows',
      wide: true,
      body:
        "How a bike moves from one state to the next — deployed, under repair, quality check, ready to deploy, retired. A map of the rules the rest of the app enforces, drawn out so the whole path is visible at once.",
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
