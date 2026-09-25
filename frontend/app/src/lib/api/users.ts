import { IS_LIVE } from './client';
import * as live from './users.live';
import * as mock from './users.mock';

/**
 * Which users module the screens get.
 *
 * S3 shipped a real API; the other modules have not. Rather than a half-wired
 * build where some imports point at mocks and some do not, every module keeps
 * one import path and the choice is made here, once, from VITE_API_BASE.
 *
 * The two implementations share a signature by construction — the compiler
 * checks it below, so a live function that drifts from its mock twin fails the
 * build rather than a screen.
 */

const impl: typeof mock = IS_LIVE ? { ...mock, ...live } : mock;

export const listUsers = impl.listUsers;
export const updateUser = impl.updateUser;