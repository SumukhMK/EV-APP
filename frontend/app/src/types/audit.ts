import type { Iso8601 } from './common';

/** Append-only. A correction is a new row, never an edit of an old one. */
export interface AuditEvent {
  id: string;
  occurredAt: Iso8601;
  actor: string;
  action: string;
  /** e.g. "Vehicle · BLRSS0419" */
  entity: string;
  before: string | null;
  after: string | null;
}
