import type {
  FleetSummary,
  HubUtilisation,
  MonthlyDeployments,
  OperationsPeriodSummary,
  RecoveryCounts,
} from '../../types';
import { request } from './client';

/**
 * The dashboard, Today's Operations and the recovery board, from the API.
 *
 * <p>These five were the last screens still reading fixtures in a live build.
 * They were never in the 2026-09-30 swap table because they never had a
 * live/mock pair to switch between — `dashboard.ts` imported `mocks/dashboard`
 * directly, with no `IS_LIVE` check at all, so every tile showed fixture data
 * however the build was configured.
 *
 * `getServiceQueues` is deliberately absent. It has no backend endpoint and no
 * screen imports it, so the facade's spread leaves it on the mock rather than
 * this file inventing a shape the API does not serve.
 */

export function getFleetSummary(): Promise<FleetSummary> {
  return request<FleetSummary>('/dashboard/fleet-summary');
}

export function getHubUtilisation(): Promise<HubUtilisation[]> {
  return request<HubUtilisation[]>('/dashboard/hub-utilisation');
}

export function getMonthlyDeployments(): Promise<MonthlyDeployments[]> {
  // Thirteen months is what the chart has always drawn: a full year plus the
  // current partial month, so the same month last year is on the axis.
  return request<MonthlyDeployments[]>('/dashboard/monthly-deployments', { query: { months: 13 } });
}

/**
 * The movement / outcome / source counts for a resolved period (screen 21).
 *
 * The dates arrive as the screen's own ISO strings and go straight through —
 * the server resolves an inclusive range, so a single-day window is from and
 * to set to the same date.
 */
export function getOperationsSummary(
  startIso: string,
  endIso: string,
): Promise<OperationsPeriodSummary> {
  return request<OperationsPeriodSummary>('/dashboard/operations-summary', {
    query: { from: startIso, to: endIso },
  });
}

/** The recovery board counts (screen 23). */
export function getRecoveryCounts(): Promise<RecoveryCounts> {
  return request<RecoveryCounts>('/dashboard/recovery-counts');
}
