import type {
  FleetSummary,
  MonthlyDeployments,
  OperationsPeriodSummary,
  ServiceQueueCounts,
} from '../../types';
import {
  fleetSummary,
  monthlyDeployments,
  operationsSummary,
  serviceQueues,
} from '../../mocks/dashboard';
import { delay } from './client';

export async function getFleetSummary(): Promise<FleetSummary> {
  return delay(fleetSummary());
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

/** The workshop queue counts (screen 22). */
export async function getServiceQueues(): Promise<ServiceQueueCounts> {
  return delay(serviceQueues());
}
