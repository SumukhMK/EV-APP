import type { AssignVehicleRequest, DeboardRiderRequest, ExchangeVehicleRequest, Rider } from '../../types';
import { request } from './client';

/**
 * The assignments module against the real API (S5).
 *
 * Same "no mapping layer" contract as vehicles.live.ts: the response is
 * RiderResponse, written field-for-field against Rider.
 */
export function assignVehicle(body: AssignVehicleRequest): Promise<Rider> {
  return request<Rider>('/assignments/assign', { method: 'POST', body });
}

export function exchangeVehicle(body: ExchangeVehicleRequest): Promise<Rider> {
  return request<Rider>('/assignments/exchange', { method: 'POST', body });
}

export function deboardRider(body: DeboardRiderRequest): Promise<Rider> {
  return request<Rider>('/assignments/deboard', { method: 'POST', body });
}
