import type { FleetSummary, MonthlyDeployments } from '../../types';
import { fleetSummary, monthlyDeployments } from '../../mocks/dashboard';
import { delay } from './client';

export async function getFleetSummary(): Promise<FleetSummary> {
  return delay(fleetSummary());
}

export async function getMonthlyDeployments(): Promise<MonthlyDeployments[]> {
  return delay(monthlyDeployments);
}
