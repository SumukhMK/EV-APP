import type { AuditEvent, Page } from '../../types';
import { request } from './client';

/**
 * Who did what, from the API.
 *
 * The trail is assembled server-side from the records the modules already
 * write — there is no audit table — so a line here means the act happened,
 * and a missing line means it did not. The fixture this replaces was twelve
 * rows dated August 2026 that rendered on an empty tenant and named real
 * colleagues.
 */
export function listAuditEvents(page = 0, size = 12): Promise<Page<AuditEvent>> {
  return request<Page<AuditEvent>>('/audit', { query: { page, size } });
}
