import type {
  FleetSummary,
  HubUtilisation,
  MonthlyDeployments,
  OperationsPeriodSummary,
  RecoveryCounts,
} from '../../types';
import {
  fleetSummary,
  hubUtilisation,
  monthlyDeployments,
  operationsSummary,
  recoveryCounts,
} from '../../mocks/dashboard';
import { delay } from './client';

export async function getFleetSummary(): Promise<FleetSummary> {
  return delay(fleetSummary());
}

export async function getHubUtilisation(): Promise<HubUtilisation[]> {
  return delay(hubUtilisation());
}

export async function getMonthlyDeployments(): Promise<MonthlyDeployments[]> {
  return delay(monthlyDeployments);
}

/** The movement / outcome / source counts for a resolved period (screen 21). */
export async function getOperationsSummary(
  startIso: string,
  endIso: string,
): Promise<OperationsPeriodSummary> {
  return delay(operationsSummary(startIso, endIso));
}


/** The recovery board counts (screen 23). */
export async function getRecoveryCounts(): Promise<RecoveryCounts> {
  return delay(recoveryCounts());
}
