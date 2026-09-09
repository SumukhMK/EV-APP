import type { Paise } from './common';

export interface FleetSummary {
  totalFleet: number;
  deployed: number;
  readyToDeploy: number;
  underRepair: number;
  qcPending: number;
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
