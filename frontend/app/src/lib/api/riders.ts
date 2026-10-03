import { IS_LIVE } from './client';
import * as live from './riders.live';
import * as mock from './riders.mock';

/**
 * Which riders module the screens get (S2). Same pattern as vehicles.ts —
 * see that file's comment for why the choice is made once, here.
 */
const impl: typeof mock = IS_LIVE ? { ...mock, ...live } : mock;

export type { RiderQuery } from './riders.mock';

export const listRiders = impl.listRiders;
export const riderFacets = impl.riderFacets;
export const getRider = impl.getRider;
export const reactivateRider = impl.reactivateRider;
export const listAssignableRiders = impl.listAssignableRiders;
export const listAssignedRiders = impl.listAssignedRiders;
export const listRiderPayments = impl.listRiderPayments;
export const onboardRider = impl.onboardRider;
