import { matchPath } from 'react-router-dom';
import { TOUR_ANCHORS, panelAnchor } from '../anchors';
import type { TourStep } from './platform';

/**
 * What each screen is, and what every card on it is for.
 *
 * A tour walks a screen the way a person reads it: the *about* first — what
 * this screen is, what is on it, what you do here — then the tile strip where
 * there is one, then each card in turn. The brief was plain: an operator
 * standing on a screen wants to know what the thing in front of them is, and a
 * tour that said "1 of 1" was not answering it.
 *
 * **Cards are named, not numbered.** A card's step is keyed by the label the
 * card already shows, and `Panel` turns that same label into the anchor. The
 * words here are therefore written against what an operator can actually read
 * on screen, and a renamed card cannot quietly point its step at the wrong box
 * — the step stops matching and drops out.
 *
 * **A card that is not there is skipped, not waited for.** Several are
 * conditional: a rider's bike panel only when they hold one, the bulk-upload
 * preview only after a file is read, a job's "what happens next" until it is
 * closed. Both variants are described and whichever is absent removes itself.
 *
 * This is the file you edit to cover a screen or a new card. The engine needs
 * no change to learn either.
 */

interface PageAbout {
  /** The screen's own title, shown on the about step. */
  title: string;
  /** What this screen is, what is on it, what you do here. */
  about: string;
  /** What the stat tiles mean, for a screen that has them. */
  tiles?: string;
  /** Card label exactly as the card shows it, to what that card is for. */
  cards?: Record<string, string>;
}

const PAGES: Record<string, PageAbout> = {

  '/dashboard': {
    title: "Dashboard",
    about:
      "The fleet at a glance: how many bikes you own, how many are out earning, and how many are off the road. Below the counts, deployments month by month and a service and inventory summary. It is a read — nothing here changes anything.",
    tiles:
      "Total fleet is every bike you own. Active is out with a rider; Ready to deploy is waiting for one. In service, Quality check and Recovery are off the road. The last two are money: riders behind on rent, and how much is owed.",
    cards: {
      "Deployments per month":
        "How many bikes went out to riders each month over the last year, with the average and the busiest month called out. It is the shape of your growth, not a live number.",
      "Service & inventory":
        "Open job cards, parts awaiting, stock value and weekly service cost. Phase 2 work — the panel is here so the shape is visible, but there is no data behind it yet.",
    },
  },

  '/operations/today': {
    title: "Today's operations",
    about:
      "What needs doing today, in one place: where the bikes are now, how they have moved, how they came in for service, and how busy each hub is. Click any number to see exactly which bikes it counts.",
    tiles:
      "The counts for the period you have chosen: what moved, what is waiting and what needs a person. Click any one of them to open the bikes it counts rather than hunting for them in the vehicles list.",
    cards: {
      "Period":
        "Switches everything on this screen between today, this week and this month. The counts, the charts and the hub load all follow it.",
      "Bike movement":
        "How many bikes went out and came back over the period, so a quiet week or a sudden rush is obvious at a glance.",
      "Where the bikes are now":
        "A live breakdown of the fleet by state — deployed, ready, in service, in QC. This is the snapshot; the panels around it are the movement.",
      "How bikes came in for service":
        "Why bikes came off the road — breakdown, accident, scheduled service. Use it to tell bad luck apart from a pattern worth fixing.",
      "How busy each hub is":
        "Work split across your hubs, so one hub quietly carrying the fleet shows up before it becomes a problem.",
    },
  },

  '/vehicles': {
    title: "Vehicles",
    about:
      "Every bike you own, one row each, with its registration, model, hub, state and the rider holding it. Search or filter to find one, then open a row for its full record. New bikes are added from here too, singly or from a spreadsheet.",
  },

  '/vehicles/:vehicleId': {
    title: "One bike",
    about:
      "One bike's whole life: its specification, every rider who has held it, every service it has been through, and the lifecycle events that moved it between states. Nothing here is editable — this is the record, and corrections are made on the edit screen.",
    cards: {
      "Specification":
        "What the bike is: make, model, chassis number, battery type and vendor, and the devices fitted to it. The fixed facts, as inducted or last corrected.",
      "Current rider":
        "The rider holding this bike right now, and since when. Open them for their side of the story — payments, history, the rest of their record.",
      "Rider":
        "Nobody is on this bike at the moment. When it is assigned, this panel names the rider and the date they took it.",
      "Service records":
        "Every time this bike came off the road: what was wrong, what was done, and what it cost. A bike that keeps appearing here is telling you something.",
      "Assignment history":
        "Every rider who has held this bike, with the dates. Useful when a fault turns out to have started under a previous rider.",
      "Lifecycle":
        "The state changes this bike has been through, in order, with who made each one. The audit trail for this one vehicle.",
    },
  },

  '/vehicles/new': {
    title: "Add vehicle",
    about:
      "Induct one bike into the fleet: its identity and chassis number, make and model, battery, the devices fitted to it, and the hub it belongs to. For a whole spreadsheet of bikes at once, use bulk upload instead.",
    cards: {
      "Identity":
        "The registry id and chassis number — the two things that must be unique across the fleet. A duplicate is refused here rather than discovered later.",
      "Specification":
        "Make, model, battery type and vendor. What the bike is, as opposed to which bike it is.",
      "Devices":
        "The controller and any other hardware fitted to this bike, recorded so a swapped device can be traced back.",
    },
  },

  '/vehicles/bulk-upload': {
    title: "Bulk upload",
    about:
      "Bring a spreadsheet of bikes in at once. The file is checked first — you see which columns were recognised, which are missing, and a row-by-row preview of what will be created. Nothing is saved until you confirm, and only clean rows are imported.",
    tiles:
      "Once a file is read, these count what is in it: total rows, how many are importable, and how many have a problem. Only the clean ones will be created.",
    cards: {
      "File":
        "Drop the spreadsheet here, or download the template first if you are starting from scratch. Ten megabytes and two thousand rows is the ceiling.",
      "Checking the file":
        "The server is reading your columns and matching them to the ones it needs. Common spellings are recognised, so there is nothing to map by hand.",
      "The file could not be used":
        "Something stopped the whole file being read — a missing column, or more rows than the limit. It lists what it found next to what it needed.",
      "Preview":
        "Every row, with any problem named against it. Nothing has been saved yet. Confirm to import the clean rows; the bad ones you fix and upload again.",
    },
  },

  '/vehicles/:vehicleId/edit': {
    title: "Edit vehicle",
    about:
      "Correct a bike's record: make, model, battery, devices, hub. Only the fields that describe the bike can be changed. Its services, its assignments and its history are a record of what happened and cannot be edited here.",
    cards: {
      "Specification":
        "Make, model and battery. Correcting a typo made at induction, not recording a change to the bike itself.",
      "Devices":
        "The hardware fitted to this bike. Change it here when a controller is swapped so the record follows the physical bike.",
    },
  },

  '/service/queues': {
    title: "Bikes in service",
    about:
      "Every bike that is off the road, and the stage it has reached. Filter by queue, status or hub to look at one part of the workshop at a time. Open a job to see what was reported and what has been done to it.",
  },

  '/service/qc': {
    title: "QC queue",
    about:
      "Bikes that have been worked on and are waiting to be signed off before they go back out. This is the last gate: a bike passes and returns to the fleet, or it fails and goes back to the workshop.",
  },

  '/service/inspection': {
    title: "Inspection",
    about:
      "Record what you found on a bike, point by point. The result decides which queue the bike goes to next, so it is worth filling in from the bike in front of you rather than from memory.",
  },

  '/service/assistance': {
    title: "Help desk",
    about:
      "Riders who called for help, with what was reported, how the bike reached you, and where each job has got to. Filter by status, source or hub to narrow it down, or start a new job from here.",
  },

  '/service/assistance/new': {
    title: "New help job",
    about:
      "Log a rider's problem and get it moving: what happened, which bike, how bad the damage is, and how the bike reached you. Those answers decide which queue the job lands in, so they are worth getting right.",
    cards: {
      "Bike and problem":
        "Which bike, and what the rider says is wrong with it. Pick the bike first — the problem fields stay locked until you do, so a report cannot be attached to the wrong vehicle.",
      "Find or start a check":
        "Search for a check already open on this bike, or begin a new one if there is none. Starting a second check on the same bike is what this prevents.",
    },
  },

  '/service/assistance/:jobId': {
    title: "One help job",
    about:
      "One help job end to end: what the rider reported, how the bike came in, everything done to it so far, and the quality check that closes it. The job is moved to its next stage from here.",
    cards: {
      "What was reported":
        "The rider's account and how the bike reached you, as logged when the job opened. It does not change as the job moves.",
      "What you found, and what it costs":
        "What the workshop actually found, line by line, with the cost against each item. This is the estimate becoming a bill.",
      "Check and confirm":
        "Read back what is about to be recorded before it is committed. The last chance to catch a wrong bike or a wrong amount.",
      "Quality Check":
        "The sign-off that decides whether this bike goes back out or returns to the workshop. Pass or fail — there is no saving half a decision.",
      "What happened so far":
        "Every step this job has been through, in order, with the person who did it and when. The audit trail for this one repair.",
      "What happens next":
        "The moves available from where the job stands now. Only the legal next steps are offered, so a job cannot skip a stage.",
      "How it ended":
        "This job is closed. What was done, what it cost, and when the bike went back out.",
    },
  },

  '/riders': {
    title: "Riders",
    about:
      "Everyone on your register. Active riders are holding a bike right now; inactive riders are on the books without one. Search by name or phone, filter by status, and open anyone for their full record.",
  },

  '/riders/:riderId': {
    title: "One rider",
    about:
      "One rider's record: who they are and how to reach them, the bike they hold, what they have paid and what they owe, and every assignment, exchange and deboarding they have been through.",
    cards: {
      "Profile":
        "Who this rider is at a glance: whether they are active, how to reach them, what they pay, and whether their KYC is complete or still outstanding.",
      "Current bike":
        "The bike this rider is holding and since when. Exchange or deboard from here rather than hunting for them on another screen.",
      "Bike":
        "This rider has no bike at the moment, so they sit on the register as inactive. Assign one from here and the panel becomes their current bike.",
      "Identity and address":
        "The documents and address captured when this rider was onboarded, and whether each one has been verified. An unverified field here is the thing to chase before it becomes a problem.",
      "Bike history":
        "Every bike this rider has held, with the dates and the reason each one ended. A rider who keeps exchanging is worth a closer look.",
      "Payment history":
        "What this rider has been charged and what they have paid, week by week. The place to check before chasing anyone.",
    },
  },

  '/riders/onboard': {
    title: "Onboard rider",
    about:
      "Put a new rider on the register: who they are, how to reach them, where they live, and the commercial terms agreed. The sections can be filled in any order, so take them as the rider gives them. This does not hand over a bike — assign one afterwards.",
    cards: {
      "Summary":
        "What the register will hold once you save — name, phone, rent, billing day, deposit. It fills in as you type, so you can check it before committing.",
      "Verification":
        "Which of the rider's details have been verified and which are still pending. A rider can be onboarded with verification outstanding; it is shown here rather than hidden.",
    },
  },

  '/assignments/assign': {
    title: "Assign vehicle",
    about:
      "Hand a bike to a rider who does not have one. Pick the rider, pick an available bike, confirm. A rider holds one bike at a time, so only riders who are waiting and bikes that are ready to deploy appear here.",
    cards: {
      "Rider":
        "Pick who is getting a bike. Only riders without one appear here, because a rider holds exactly one bike at a time.",
      "Available bikes":
        "Bikes that are ready to deploy right now. Anything in service, in QC or already with a rider is not offered.",
      "Summary":
        "The pairing you are about to make — this rider, this bike — gathered in one place so it can be checked before anything is committed.",
    },
  },

  '/assignments/exchange': {
    title: "Exchange vehicle",
    about:
      "Move a rider from the bike they hold onto a different one — a swap, not a second bike. The old bike comes back into the fleet and goes wherever its condition sends it. Only riders currently holding a bike appear here.",
    cards: {
      "Who is swapping?":
        "Pick the rider making the swap. Only riders currently holding a bike appear, because there is nothing to exchange otherwise.",
      "The bike coming back":
        "The bike this rider holds now, and the condition it is returning in. That condition decides where it goes next.",
      "The new bike":
        "The bike this rider is moving onto, chosen from whatever is ready to deploy right now. Bikes in service or already with someone are not offered.",
      "Summary":
        "Both halves of the swap together — what comes back, what goes out — before it is committed.",
    },
  },

  '/assignments/deboard': {
    title: "Deboard rider",
    about:
      "Take the bike back and close a rider's time on it. The bike returns to the fleet; the rider stays on the register as inactive, so their history is kept. Only riders currently holding a bike appear here.",
    cards: {
      "Rider and bike":
        "Who is finishing, and which bike is coming back with them. Only riders currently holding a bike appear in the list.",
      "Why is the bike coming back?":
        "The reason this is ending, and the condition of the bike. The condition decides whether it goes back out or into the workshop.",
      "Money":
        "Anything still owed, and the deposit to be returned or withheld. Settled here so the rider does not leave with it unresolved.",
      "Before you finish":
        "A last read of what is about to happen, because taking a bike back is not something you want to undo.",
    },
  },

  '/payments/run': {
    title: "Weekly payment run",
    about:
      "This week's collections, rider by rider: what each one owes and what has come in. Record payments as they are taken and the totals at the top move with you. Open a rider for the receipt behind their line.",
    tiles:
      "What the week comes to: how much is due across all riders, how much has come in, and how much is still outstanding. They move as you record payments.",
    cards: {
      "This period":
        "Which week you are collecting for. Everything on the screen follows it, so check it before you start recording.",
    },
  },

  '/payments/run/:riderId': {
    title: "Receipt",
    about:
      "One rider's week in detail: who they are, what they were charged and why, and the payment recorded against it. This is the receipt sitting behind a single line in the weekly payment run.",
    cards: {
      "Rider":
        "Who this receipt belongs to, how to reach them, and the terms they are billed under. Enough to settle a query without leaving the page.",
      "Charges":
        "What was billed this week and why — rent, and anything added on top. The line-by-line working behind the total.",
      "Payment":
        "What was actually received, how it was paid, and when. The other side of the charges above.",
    },
  },

  '/payments/overdue': {
    title: "Overdue riders",
    about:
      "Who is behind on rent and by how much, worst first. The totals at the top say how much is outstanding across the whole fleet before you open anyone. Use it to decide who to chase today.",
    tiles:
      "How much is outstanding across the fleet, and how many riders it is spread across. The size of the problem before you open any one rider.",
  },

  '/recovery': {
    title: "Recovery",
    about:
      "Money and bikes chased after a rider has gone: what still needs recovering, what has come back, and which vehicles are missing. The tail end of a rental, kept visible so it does not get forgotten.",
  },

  '/users': {
    title: "Users & roles",
    about:
      "Everyone who can sign in to FleeTech and what each of them is allowed to do. Add an account, change a role, or disable someone who has left. The roles panel explains what each role can reach — worth reading before handing one out.",
    cards: {
      "Accounts":
        "Everyone who can sign in: their name, email, role and whether the account is active. Change a role or disable someone from here.",
      "Roles":
        "What each of the four roles can actually reach. Worth reading before you hand one out — a service manager never sees money, a fleet hand never sees admin.",
    },
  },

  '/audit': {
    title: "Audit log",
    about:
      "Every change anyone has made, newest first, with their name against it: who did what, to which record, and when. Nothing here can be edited or removed, which is rather the point of keeping it.",
  },

  '/flows': {
    title: "Flows",
    about:
      "How a bike moves from one state to the next — deployed, under repair, quality check, ready to deploy, retired. A map of the rules the rest of the app enforces, drawn out so the whole path is visible at once.",
    cards: {
      "Healthy":
        "The colour key for the diagram above: which states count as healthy, which are a caution, and which are a problem you should be acting on.",
    },
  },

  '/design-tokens': {
    title: "Design tokens",
    about:
      "The colours, type and spacing the whole app is built from, shown in both light and dark. Tooling rather than product: it exists so a change to the palette can be judged in one place instead of screen by screen.",
    cards: {
      "Neutrals":
        "The grey ramp the whole app is built on, indexed by role rather than lightness — 100 contrasts most against the page, 900 sits closest to it.",
      "Accent":
        "The accent ramp, which is purple by night and orange by day. One token resolving to two schemes, which is why adding light mode did not mean editing every screen.",
      "Status tones":
        "The colours that say what a thing is — good, caution, warning, bad — each separated by luminance as well as hue so they read in greyscale.",
      "Intensity scale":
        "The colours that say how a thing is doing, ranked high to risk. Magnitude, where status tones are state.",
      "Surfaces and fills":
        "The backgrounds everything sits on: the page itself, a raised card, a solid action fill, and the text colour that stays legible on top of it.",
      "Plot colours":
        "The series colours charts draw with, kept apart from status so a bar chart does not accidentally imply alarm.",
      "Controls":
        "How inputs, buttons and chips resolve against the tokens above, shown together so a change can be judged in one place.",
    },
  },

};

/** A stable step id from a route and a part of it, so progress and tests have something to hold. */
function stepId(route: string, part: string): string {
  return `${route.replace(/^\//, '')}:${part}`;
}

/**
 * One screen's steps, built from its description rather than written out.
 *
 * The order is the order a person reads the screen: what this is, then the
 * numbers across the top, then each card down the page.
 */
function build(route: string, page: PageAbout): TourStep[] {
  const steps: TourStep[] = [
    {
      id: stepId(route, 'what'),
      anchor: TOUR_ANCHORS.pageTitle,
      title: page.title,
      wide: true,
      body: page.about,
    },
  ];

  if (page.tiles) {
    steps.push({
      id: stepId(route, 'tiles'),
      anchor: TOUR_ANCHORS.statTiles,
      title: 'The counts',
      wide: true,
      body: page.tiles,
    });
  }

  for (const [label, body] of Object.entries(page.cards ?? {})) {
    steps.push({
      id: stepId(route, `card:${label}`),
      anchor: panelAnchor(label),
      title: label,
      wide: true,
      body,
    });
  }

  return steps;
}

const tours: Record<string, TourStep[]> = Object.fromEntries(
  Object.entries(PAGES).map(([route, page]) => [route, build(route, page)]),
);

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

/** The tour for a screen, or null for a path that is not one. */
export function pageTourFor(pathname: string): TourStep[] | null {
  for (const pattern of RANKED) {
    if (matchPath({ path: pattern, end: true }, pathname)) return tours[pattern];
  }
  return null;
}

