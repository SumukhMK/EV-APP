import type { FleetSummary, MonthlyDeployments } from '../types';
import { overdueRiders } from './payments';
import { vehicles } from './vehicles';

/**
 * Derived, never hardcoded — if a fixture changes, the tiles follow. The
 * wireframe printed an overdue value of 22,551 against sixteen riders; the
 * figure here is the sum of the actual overdue rows for the same reason.
 */
export const fleetSummary = (): FleetSummary => ({
  totalFleet: vehicles.length,
  deployed: vehicles.filter((v) => v.state === 'DEPLOYED').length,
  readyToDeploy: vehicles.filter((v) => v.state === 'READY_TO_DEPLOY').length,
  underRepair: vehicles.filter((v) => v.state === 'UNDER_REPAIR').length,
  qcPending: vehicles.filter((v) => v.state === 'QC_PENDING').length,
  overdueRiders: overdueRiders.length,
  overdueValue: overdueRiders.reduce((sum, o) => sum + o.amountDue, 0),
});

/** Artboard 02's bar chart: thirteen months to Aug 2026. */
export const monthlyDeployments: MonthlyDeployments[] = [
  ['2025-08', 9], ['2025-09', 12], ['2025-10', 7], ['2025-11', 14], ['2025-12', 18],
  ['2026-01', 11], ['2026-02', 16], ['2026-03', 21], ['2026-04', 13], ['2026-05', 10],
  ['2026-06', 15], ['2026-07', 12], ['2026-08', 6],
].map(([month, count]) => ({ month: month as string, count: count as number }));
