import type { User } from '../types';

/**
 * The operator accounts behind artboard 18. Names and the one @g1 email
 * pattern are lifted from the audit log fixture, so the same people who appear
 * as actors there appear here as accounts — Priya changes roles, Meenakshi
 * runs the fleet day to day, Abhinandan and Dhananjay work the workshop.
 *
 * Two non-active accounts are kept on purpose: an invited user who has never
 * signed in, and a disabled one, so the status column is never all one value.
 */
export const users: User[] = [
  u('U01', 'Priya Menon', 'priya@g1', 'SUPER_ADMIN', 'ACTIVE', '2026-08-26T08:40:00+05:30', '2025-06-01'),
  u('U02', 'Meenakshi Iyer', 'meenakshi@g1', 'TENANT_ADMIN', 'ACTIVE', '2026-08-26T09:41:00+05:30', '2025-06-04'),
  u('U03', 'Ravi Shastri', 'ravi@g1', 'TENANT_ADMIN', 'ACTIVE', '2026-08-25T15:38:00+05:30', '2025-07-19'),
  u('U04', 'Abhinandan', 'abhinandan@g1', 'SERVICE_MANAGER', 'ACTIVE', '2026-08-25T18:30:00+05:30', '2025-08-02'),
  u('U05', 'Dhananjay', 'dhananjay@g1', 'FLEET_STAFF', 'ACTIVE', '2026-08-26T08:57:00+05:30', '2025-09-11'),
  u('U06', 'Sana Qureshi', 'sana@g1', 'FLEET_STAFF', 'INVITED', null, '2026-08-24'),
  u('U07', 'Harish Rao', 'harish@g1', 'SERVICE_MANAGER', 'DISABLED', '2026-05-14T11:20:00+05:30', '2025-10-30'),
];

function u(
  id: string,
  name: string,
  email: string,
  role: User['role'],
  status: User['status'],
  lastActiveAt: string | null,
  createdOn: string,
): User {
  return { id, name, email, role, status, lastActiveAt, createdOn };
}
