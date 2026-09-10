import type { Paise } from './common';

export interface FleetSummary {
  totalFleet: number;
  deployed: number;
  readyToDeploy: number;
  underRepair: number;
  qcPending: number;
  /** Current fleet counts, so any tile that links to a filtered list agrees with it. */
  accident: number;
  recovery: number;
  overdueRiders: number;
  overdueValue: Paise;
}

export interface MonthlyDeployments {
  /** "2026-08" */
  month: string;
  count: number;
}

/**
 * What happened in a period, the way Today's Operations slices it (screen 21):
 * how bikes moved, what state they landed in, and where the service demand
 * came from. Every figure is a count of events inside the resolved range.
 */
export interface OperationsPeriodSummary {
  movement: { deployed: number; exchanged: number; returned: number; recovered: number };
  outcome: { readyToDeploy: number; underRepair: number; qcPending: number; accident: number };
  source: { rsa: number; walkIn: number; qrt: number };
}

/**
 * The service queues (screen 22): everything stuck in the workshop, split the
 * way the prototype splits it — seven kinds of repair on one side, three
 * sources of a live service call on the other.
 */
export interface ServiceQueueCounts {
  underRepair: {
    minor: number;
    major: number;
    accident: number;
    warranty: number;
    insurance: number;
    partsWaiting: number;
    qcPending: number;
  };
  inService: { walkIn: number; rsa: number; qrt: number };
}

/**
 * The recovery board (screen 23): bikes that need chasing down and the ones
 * already back. Two of the "need to recover" rows are payment-driven — a rider
 * behind on rent — and the rest are about where the bike physically is.
 */
export interface RecoveryCounts {
  needToRecover: {
    partiallyPaid: number;
    notPaid: number;
    leftAtRoadside: number;
    missing: number;
    accident: number;
  };
  recovered: { recovered: number };
}
