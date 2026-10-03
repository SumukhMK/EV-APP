import { IS_LIVE } from './client';
import * as live from './inspections.live';
import * as mock from './inspections.mock';

/**
 * Which inspections module the screens get — partial by design.
 *
 * `recordInspection`, `listQcQueue` and `decideQc` have no real backend
 * equivalent (see inspections.mock.ts), so inspections.live.ts does not
 * export them, and the merge below leaves those three resolving to the mock
 * even in a live build.
 */
const impl: typeof mock = IS_LIVE ? { ...mock, ...live } : mock;

export const listInspectableVehicles = impl.listInspectableVehicles;
export const getVehicleServiceHistory = impl.getVehicleServiceHistory;
