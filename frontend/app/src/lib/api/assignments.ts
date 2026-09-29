import { IS_LIVE } from './client';
import * as live from './assignments.live';
import * as mock from './assignments.mock';

/**
 * Which assignments module the screens get (S5). Same pattern as
 * vehicles.ts — see that file's comment for why the choice is made once,
 * here.
 */
const impl: typeof mock = IS_LIVE ? { ...mock, ...live } : mock;

export const assignVehicle = impl.assignVehicle;
export const exchangeVehicle = impl.exchangeVehicle;
export const deboardRider = impl.deboardRider;
