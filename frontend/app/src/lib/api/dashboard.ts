import { IS_LIVE } from './client';
import * as live from './dashboard.live';
import * as mock from './dashboard.mock';

/**
 * Which dashboard module the screens get.
 *
 * The same facade every other module uses, added late: this file used to
 * import `mocks/dashboard` directly with no `IS_LIVE` check, so the dashboard,
 * Today's Operations and the recovery board rendered fixtures even in a live
 * build. It was not missed in the module sweep — it was never one of the six,
 * because it had no live implementation to switch to until the API grew one.
 *
 * The spread means a function absent from `dashboard.live.ts` silently stays
 * on the mock. That is load-bearing for exactly one export, `getServiceQueues`,
 * which has no endpoint and no caller.
 */
const impl: typeof mock = IS_LIVE ? { ...mock, ...live } : mock;

export const getFleetSummary = impl.getFleetSummary;
export const getHubUtilisation = impl.getHubUtilisation;
export const getMonthlyDeployments = impl.getMonthlyDeployments;
export const getOperationsSummary = impl.getOperationsSummary;
export const getRecoveryCounts = impl.getRecoveryCounts;

/**
 * Mock-only, permanently for now: there is no `/dashboard/service-queues`
 * endpoint and no screen imports this. `GET /service/queues/counts` is the
 * backend's equivalent and returns a different shape; wiring the two together
 * is work for whoever builds the screen that needs it.
 */
export const getServiceQueues = impl.getServiceQueues;
