import { IS_LIVE } from './client';
import * as live from './vehicles.live';
import * as mock from './vehicles.mock';

/**
 * Which vehicles module the screens get.
 *
 * S1 shipped a real API; the other modules have not. Rather than a half-wired
 * build where some imports point at mocks and some do not, every module keeps
 * one import path and the choice is made here, once, from VITE_API_BASE.
 *
 * The two implementations share a signature by construction — the compiler
 * checks it below, so a live function that drifts from its mock twin fails the
 * build rather than a screen.
 */

const impl: typeof mock = IS_LIVE ? { ...mock, ...live } : mock;

export type { VehicleQuery } from './vehicles.mock';

export const listVehicles = impl.listVehicles;
export const vehicleFacets = impl.vehicleFacets;
export const vehicleFilterOptions = impl.vehicleFilterOptions;
export const getVehicle = impl.getVehicle;
export const createVehicle = impl.createVehicle;
export const updateVehicle = impl.updateVehicle;
export const previewBulkUpload = impl.previewBulkUpload;
export const commitBulkUpload = impl.commitBulkUpload;

/**
 * Not an API call. The make follows from the model name by a rule both sides
 * apply, so it stays local in either mode.
 */
export { deriveMake } from './vehicles.mock';
