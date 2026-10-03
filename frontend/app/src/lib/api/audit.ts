import { IS_LIVE } from './client';
import * as live from './audit.live';
import * as mock from './audit.mock';

/**
 * Which audit module the screen gets.
 *
 * It had no live half at all until the API grew one: this file imported the
 * fixture directly with no IS_LIVE check, so a deployed build showed twelve
 * hardcoded August 2026 rows to whoever opened it.
 */
const impl: typeof mock = IS_LIVE ? { ...mock, ...live } : mock;

export const listAuditEvents = impl.listAuditEvents;
