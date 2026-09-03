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
