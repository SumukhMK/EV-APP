import type { AuditEvent, Page } from '../../types';
import { auditEvents } from '../../mocks/audit';
import { delay, paginate } from './client';

export async function listAuditEvents(page = 0, size = 12): Promise<Page<AuditEvent>> {
  return delay(paginate(auditEvents, page, size));
}
