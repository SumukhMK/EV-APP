import { IS_LIVE } from './client';
import * as live from './serviceJobs.live';
import * as mock from './serviceJobs.mock';

/**
 * Which service-jobs module the screens get (S4). Same pattern as
 * vehicles.ts — see that file's comment for why the choice is made once,
 * here, from VITE_API_BASE.
 */
const impl: typeof mock = IS_LIVE ? { ...mock, ...live } : mock;

export const listServiceJobs = impl.listServiceJobs;
export const getServiceJob = impl.getServiceJob;
export const createServiceJob = impl.createServiceJob;
export const closeServiceJob = impl.closeServiceJob;
export const updateServiceJob = impl.updateServiceJob;
