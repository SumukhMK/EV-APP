import type { Facet, Page, Rider, RiderStatus } from '../../types';
import { riders } from '../../mocks/riders';
import { ApiError, delay, paginate } from './client';
import { RIDER_STATUS_LABEL } from '../labels';

/**
 * OWNER: SMK (contract + mock). Abhiram's rider screens consume this and do
 * not reach into src/mocks. If a rider screen needs a field that isn't here,
 * raise it — the field is added to the type first, then the mock.
 */

export interface RiderQuery {
  page?: number;
  size?: number;
  q?: string;
  status?: RiderStatus | 'ALL';
}

function match(r: Rider, query: RiderQuery) {
  if (query.status && query.status !== 'ALL' && r.status !== query.status) return false;
  const q = query.q?.trim().toLowerCase();
  if (!q) return true;
  return (
    r.name.toLowerCase().includes(q) ||
    r.id.toLowerCase().includes(q) ||
    r.phone.includes(q) ||
    (r.currentVehicleId ?? '').toLowerCase().includes(q)
  );
}

export async function listRiders(query: RiderQuery = {}): Promise<Page<Rider>> {
  const filtered = riders.filter((r) => match(r, query));
  return delay(paginate(filtered, query.page ?? 0, query.size ?? 12));
}

export async function riderFacets(query: Omit<RiderQuery, 'status'> = {}): Promise<Facet<RiderStatus>[]> {
  const scoped = riders.filter((r) => match(r, { ...query, status: 'ALL' }));
  const counts = new Map<RiderStatus, number>();
  for (const r of scoped) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const facets: Facet<RiderStatus>[] = [{ value: 'ALL', label: 'All', count: scoped.length }];
  for (const [status, count] of counts) facets.push({ value: status, label: RIDER_STATUS_LABEL[status], count });
  return delay(facets);
}

export async function getRider(id: string): Promise<Rider> {
  const r = riders.find((x) => x.id === id);
  if (!r) throw new ApiError(`No rider with id ${id}`, 404);
  return delay(r);
}
