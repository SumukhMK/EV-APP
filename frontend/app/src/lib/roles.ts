import type { UserRole } from '../types';

/**
 * Cosmetic gate, not a security boundary — matching `app/session.tsx`'s own
 * framing: "there is no auth in this build and there must not appear to be".
 * These hide a button the same way the nav hides a whole section for a role,
 * so the demo shows each persona a plausible screen; the real enforcement is
 * server-side and comes with the backend. Any route is still reachable by
 * typing its URL, on purpose — these guard the action, not the page.
 */

/** The registry's specification is corrected by fleet and admin roles; the
 *  service desk inspects and repairs it, it does not re-edit the record. */
export function canEditVehicle(role: UserRole): boolean {
  return role !== 'SERVICE_MANAGER';
}

/** Only the roles the Money nav section is already shown to may collect a
 *  payment — a service manager or fleet hand looking at a run reads it, but
 *  cannot record a collection against it. */
export function canCollectPayments(role: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN';
}

/** The assistance desk is worked by the service and admin roles; fleet staff
 *  can see a job's queue position but do not price and close it. */
export function canCloseServiceJob(role: UserRole): boolean {
  return role !== 'FLEET_STAFF';
}
