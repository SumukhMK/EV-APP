import type { AuditEvent } from '../types';

/** Artboard 19, verbatim. Append-only: newest first. */
export const auditEvents: AuditEvent[] = [
  ev('2026-08-26T09:41:00+05:30', 'Meenakshi Iyer', 'Payment recorded', 'Payment · R03 / 24 Aug', 'Due 1,750', 'Paid 1,750'),
  ev('2026-08-26T09:22:00+05:30', 'Meenakshi Iyer', 'State changed', 'Vehicle · BLRSS0419', 'Under repair', 'QC pending'),
  ev('2026-08-26T08:57:00+05:30', 'Dhananjay', 'Repair closed', 'Vehicle · BLRSS0419', 'Category minor', 'Awaiting QC'),
  ev('2026-08-25T18:30:00+05:30', 'Abhinandan', 'QC failed', 'Vehicle · FBLSS0074', 'QC pending', 'Under repair'),
  ev('2026-08-25T17:12:00+05:30', 'Meenakshi Iyer', 'Assignment closed', 'Rider · R29', 'BLRSS0388', 'None'),
  ev('2026-08-25T16:04:00+05:30', 'Meenakshi Iyer', 'Assignment opened', 'Rider · R44', 'None', 'BLRSS0431'),
  ev('2026-08-25T15:38:00+05:30', 'Ravi Shastri', 'Plan changed', 'Rider · R26', '1700', '1600'),
  ev('2026-08-25T12:19:00+05:30', 'Meenakshi Iyer', 'Vehicles imported', 'Bulk · 94 rows', '137 vehicles', '231 vehicles'),
  ev('2026-08-24T19:02:00+05:30', 'Abhinandan', 'Inspection recorded', 'Vehicle · BLRSS0407', 'Returned', 'Under repair'),
  ev('2026-08-24T11:44:00+05:30', 'Meenakshi Iyer', 'Rider onboarded', 'Rider · R44', null, 'Bhaskar Nayak'),
  ev('2026-08-24T10:15:00+05:30', 'Priya Menon', 'Role changed', 'User · abhinandan@g1', 'Fleet staff', 'Service manager'),
  ev('2026-08-24T09:03:00+05:30', 'Meenakshi Iyer', 'Payment run opened', 'Period · Mon 24 Aug', null, '58 riders billed'),
];

function ev(
  occurredAt: string,
  actor: string,
  action: string,
  entity: string,
  before: string | null,
  after: string | null,
): AuditEvent {
  return { id: `${occurredAt}-${entity}`, occurredAt, actor, action, entity, before, after };
}
