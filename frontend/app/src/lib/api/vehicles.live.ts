import type {
  BatteryType,
  BulkUploadPreview,
  CreateVehicleRequest,
  Facet,
  Page,
  Vehicle,
  VehicleDetail,
  VehicleState,
  UpdateVehicleRequest,
} from '../../types';
import { request } from './client';
import type { VehicleQuery } from './vehicles.mock';

/**
 * The vehicles module against the real API (S1).
 *
 * Every function here is the same signature as its twin in vehicles.mock.ts,
 * because vehicles.ts picks between them and no screen knows which it got.
 * There is no mapping layer: VehicleResponse and VehicleDetailResponse were
 * written field-for-field against the contract types, so the JSON *is* the
 * type. Anything that needs translating is a contract drift to fix on the
 * server, not to paper over here.
 */

/** The five filters the list, facets, and count endpoints all share. */
function filters(query: VehicleQuery) {
  return {
    q: query.q,
    state: query.state,
    hub: query.hub,
    make: query.make,
    batteryType: query.batteryType,
  };
}

export function listVehicles(query: VehicleQuery = {}): Promise<Page<Vehicle>> {
  return request<Page<Vehicle>>('/vehicles', {
    query: { ...filters(query), page: query.page, size: query.size },
  });
}

export function vehicleFacets(query: Omit<VehicleQuery, 'state'> = {}): Promise<Facet<VehicleState>[]> {
  return request<Facet<VehicleState>[]>('/vehicles/facets', { query: filters(query) });
}

export function vehicleFilterOptions(): Promise<{ makes: string[]; batteryTypes: BatteryType[] }> {
  return request<{ makes: string[]; batteryTypes: BatteryType[] }>('/vehicles/filter-options');
}

export function getVehicle(id: string): Promise<VehicleDetail> {
  return request<VehicleDetail>(`/vehicles/${encodeURIComponent(id)}`);
}

export function createVehicle(body: CreateVehicleRequest): Promise<Vehicle> {
  return request<Vehicle>('/vehicles', { method: 'POST', body });
}

export function updateVehicle(body: UpdateVehicleRequest): Promise<VehicleDetail> {
  // vehicleId addresses the row; it is not editable, and the request record
  // has no field to receive it. Sending it in the body is how they disagree.
  const { vehicleId, ...rest } = body;
  return request<VehicleDetail>(`/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: 'PUT',
    body: rest,
  });
}

/**
 * Stages the file server-side and returns what would be imported.
 *
 * The preview is a real row in vehicle_imports, not a client-side guess, so
 * the commit imports exactly what was shown — including after a reload.
 */
export function previewBulkUpload(file: File): Promise<BulkUploadPreview> {
  return request<BulkUploadPreview>('/vehicles/imports', { method: 'POST', file });
}

export function commitBulkUpload(preview: BulkUploadPreview): Promise<{ imported: number }> {
  return request<{ imported: number }>(
    `/vehicles/imports/${encodeURIComponent(preview.importId)}/commit`,
    { method: 'POST' },
  );
}
