import type { ServiceJob, Vehicle } from '../../types';
import { request } from './client';
import { listVehicles } from './vehicles';
import type { Page } from '../../types';

/**
 * Live half of inspections.ts (S4), partial by design.
 *
 * Only the two functions actually called from a production screen
 * (`getVehicleServiceHistory` from VehicleDetail.tsx, `listInspectableVehicles`
 * from AssistanceJob.tsx) get a real implementation. `recordInspection`,
 * `listQcQueue` and `decideQc` have no backend endpoint — they are the mock's
 * older, superseded "routine inspection" concept (see ServiceInspection in
 * types/serviceJob.ts) — and are exercised only by mocks/serviceWorkflow.test.ts,
 * so they stay on inspections.mock.ts forever. inspections.ts's `{...mock,
 * ...live}` merge means those three simply keep resolving to the mock.
 */
const MAX_PAGE_SIZE = 100;

export async function getVehicleServiceHistory(vehicleId: string): Promise<ServiceJob[]> {
  const all: ServiceJob[] = [];
  let page = 0;
  for (;;) {
    const chunk: Page<ServiceJob> = await request<Page<ServiceJob>>('/service/jobs', {
      query: { vehicleId, page, size: MAX_PAGE_SIZE },
    });
    all.push(...chunk.content);
    if (all.length >= chunk.totalElements || chunk.content.length === 0) break;
    page += 1;
  }
  return all;
}

/** An assigned bike can visit service without ending its rider assignment — same filter as the mock, over the real vehicle list. */
export async function listInspectableVehicles(): Promise<Vehicle[]> {
  const all: Vehicle[] = [];
  let page = 0;
  for (;;) {
    const chunk = await listVehicles({ page, size: MAX_PAGE_SIZE });
    all.push(...chunk.content.filter((v) => v.state !== 'RETIRED'));
    if (page + 1 >= chunk.totalPages || chunk.content.length === 0) break;
    page += 1;
  }
  return all;
}
