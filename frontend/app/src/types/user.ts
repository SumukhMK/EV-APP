import type { Iso8601 } from './common';

/**
 * OWNER: SMK. Part of the API contract (see common.ts).
 *
 * The three tiers from BUILD.md plus the service manager the audit log already
 * names. Roles are enforced server-side once the API exists; the screen only
 * shows who holds which, it does not grant anything by drawing it.
 */
export const USER_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'FLEET_STAFF', 'SERVICE_MANAGER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type UserStatus = 'ACTIVE' | 'INVITED' | 'DISABLED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** null for a user who has been invited but never signed in. */
  lastActiveAt: Iso8601 | null;
  createdOn: Iso8601;
}
