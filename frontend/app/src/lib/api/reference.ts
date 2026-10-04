import { IS_LIVE } from './client';
import * as live from './reference.live';
import * as mock from './reference.mock';

/**
 * Reference data — the hubs and models a tenant actually has.
 *
 * The vehicle forms used to read two constants from src/mocks/seed, so a hub
 * added through the API never appeared on them. Same facade rule as every
 * other module: one import path, the choice made here from VITE_API_BASE.
 */
const impl: typeof mock = IS_LIVE ? { ...mock, ...live } : mock;

export const getFormOptions = impl.getFormOptions;
