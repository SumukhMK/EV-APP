import { Navigate, useLocation } from 'react-router-dom';
import type { ServiceQueue } from '../../types';

/** Which Job cards status filter an old Help desk queue meant. */
const STAGE_FOR_QUEUE: Partial<Record<ServiceQueue, string>> = {
  QC_PENDING: 'QC_PENDING',
  PARTS_WAITING: 'PARTS_WAITING',
};

/**
 * The QC queue and Help desk were two more lists of the same job cards. Their
 * addresses still arrive from the dashboard, today's operations and old
 * bookmarks, so they land on "All job cards" with the filter they asked for.
 */
export function LegacyJobList() {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  const queue = params.get('queue') as ServiceQueue | null;
  const next = new URLSearchParams({ board: 'all' });
  const stage = pathname === '/service/qc' ? 'QC_PENDING'
    : params.get('state') === 'UNDER_REPAIR' || queue === 'ACCIDENT' ? 'UNDER_REPAIR'
    : queue ? STAGE_FOR_QUEUE[queue] : undefined;
  if (stage) next.set('stage', stage);
  return <Navigate to={`/service/queues?${next.toString()}`} replace />;
}
