import type {
  Facet,
  OnboardRiderRequest,
  Page,
  Rider,
  RiderPaymentRow,
  RiderStatus,
} from '../../types';
import { request } from './client';
import type { RiderQuery } from './riders.mock';

/**
 * The riders module against the real API (S2).
 *
 * Same "no mapping layer" contract as vehicles.live.ts: RiderResponse was
 * written field-for-field against Rider, so the JSON is the type.
 *
 * `listRiderPayments` was written for payments.ts's S6 stage, but the
 * endpoint (`/payments/riders/{riderId}/periods`) belongs to a rider's
 * history, which this module owns — matching riders.mock.ts, where it also
 * lives rather than in payments.mock.ts.
 */
function filters(query: RiderQuery) {
  return { q: query.q, status: query.status, platform: query.platform, vehicleState: query.vehicleState };
}

export function listRiders(query: RiderQuery = {}): Promise<Page<Rider>> {
  return request<Page<Rider>>('/riders', { query: { ...filters(query), page: query.page, size: query.size } });
}

export function riderFacets(query: Omit<RiderQuery, 'status'> = {}): Promise<Facet<RiderStatus>[]> {
  return request<Facet<RiderStatus>[]>('/riders/facets', { query: filters(query) });
}

export function getRider(id: string): Promise<Rider> {
  return request<Rider>(`/riders/${encodeURIComponent(id)}`);
}

export function listAssignableRiders(): Promise<Rider[]> {
  return request<Rider[]>('/riders/assignable');
}

export function listAssignedRiders(): Promise<Rider[]> {
  return request<Rider[]>('/riders/assigned');
}

export function listRiderPayments(riderId: string): Promise<RiderPaymentRow[]> {
  return request<RiderPaymentRow[]>(`/payments/riders/${encodeURIComponent(riderId)}/periods`);
}

export function onboardRider(body: OnboardRiderRequest): Promise<Rider> {
  return request<Rider>('/riders', { method: 'POST', body });
}
