import type {
  BulkUploadPreview,
  CreateVehicleRequest,
  Facet,
  InspectionRequest,
  Page,
  Vehicle,
  VehicleDetail,
  VehicleState,
  QcQueueItem,
} from '../../types';
import {
  assignmentsByVehicle,
  bulkUploadRows,
  deviceNumbers,
  lifecycleByVehicle,
  qcQueue,
  vehicles,
} from '../../mocks/vehicles';
import { ApiError, delay, paginate } from './client';
import { VEHICLE_STATE_LABEL } from '../labels';
import { riders } from '../../mocks/riders';

export interface VehicleQuery {
  page?: number;
  size?: number;
  q?: string;
  state?: VehicleState | 'ALL';
  hub?: string | 'ALL';
}

function match(v: Vehicle, query: VehicleQuery) {
  if (query.state && query.state !== 'ALL' && v.state !== query.state) return false;
  if (query.hub && query.hub !== 'ALL' && v.hub !== query.hub) return false;
  const q = query.q?.trim().toLowerCase();
  if (!q) return true;
  return (
    v.id.toLowerCase().includes(q) ||
    v.chassisNumber.toLowerCase().includes(q) ||
    v.model.toLowerCase().includes(q) ||
    (v.currentRiderName ?? '').toLowerCase().includes(q)
  );
}

export async function listVehicles(query: VehicleQuery = {}): Promise<Page<Vehicle>> {
  const filtered = vehicles.filter((v) => match(v, query));
  return delay(paginate(filtered, query.page ?? 0, query.size ?? 12));
}

/** Counts for the chip row above the table. Always computed over the search,
 *  never over the state filter — otherwise the chips fight the user. */
export async function vehicleFacets(query: Omit<VehicleQuery, 'state'> = {}): Promise<Facet<VehicleState>[]> {
  const scoped = vehicles.filter((v) => match(v, { ...query, state: 'ALL' }));
  const counts = new Map<VehicleState, number>();
  for (const v of scoped) counts.set(v.state, (counts.get(v.state) ?? 0) + 1);

  const facets: Facet<VehicleState>[] = [{ value: 'ALL', label: 'All', count: scoped.length }];
  for (const [state, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    facets.push({ value: state, label: VEHICLE_STATE_LABEL[state], count });
  }
  return delay(facets);
}

export async function getVehicle(id: string): Promise<VehicleDetail> {
  const v = vehicles.find((x) => x.id === id);
  if (!v) throw new ApiError(`No vehicle with id ${id}`, 404);
  return delay({
    ...v,
    make: v.model.startsWith('Eagle') ? 'e-Connects' : 'e-Sprinto',
    motorNumber: deviceNumbers[v.id]?.motor ?? null,
    controllerNumber: deviceNumbers[v.id]?.controller ?? null,
    rfidTag: deviceNumbers[v.id]?.rfid ?? null,
    purchaseDate: v.inductedOn,
    lifecycle: lifecycleByVehicle[v.id] ?? [
      // Migrated bikes have no recorded history; we show the two facts we do
      // have rather than inventing a plausible one.
      { state: 'INDUCTED', occurredOn: v.inductedOn, note: 'Migrated from the registry', actor: 'Migration' },
      { state: v.state, occurredOn: v.inductedOn, note: null, actor: 'Migration' },
    ],
    assignments: assignmentsByVehicle[v.id] ?? currentAssignmentOnly(v),
  });
}

export async function createVehicle(body: CreateVehicleRequest): Promise<Vehicle> {
  if (vehicles.some((v) => v.id === body.id)) {
    throw new ApiError('A vehicle with this id already exists', 409, 'id');
  }
  if (vehicles.some((v) => v.chassisNumber === body.chassisNumber)) {
    throw new ApiError('This chassis number is already registered', 409, 'chassisNumber');
  }
  const created: Vehicle = {
    ...body,
    registrationNumber: body.registrationNumber ?? null,
    state: 'INDUCTED',
    currentRiderId: null,
    currentRiderName: null,
    odometerKm: 0,
  };
  vehicles.unshift(created);
  return delay(created, 420);
}

/** Dry run. The real endpoint validates server-side and returns the same shape. */
export async function previewBulkUpload(fileName: string): Promise<BulkUploadPreview> {
  const rows = bulkUploadRows;
  return delay(
    {
      fileName,
      totalRows: rows.length,
      validRows: rows.filter((r) => !r.error).length,
      errorRows: rows.filter((r) => r.error).length,
      rows,
    },
    600,
  );
}

export async function commitBulkUpload(preview: BulkUploadPreview): Promise<{ imported: number }> {
  return delay({ imported: preview.validRows }, 500);
}

export async function recordInspection(body: InspectionRequest): Promise<Vehicle> {
  const v = vehicles.find((x) => x.id === body.vehicleId);
  if (!v) throw new ApiError(`No vehicle with id ${body.vehicleId}`, 404);
  v.state = body.nextState;
  return delay(v, 380);
}

export async function listQcQueue(): Promise<QcQueueItem[]> {
  return delay(qcQueue.filter((q) => !qcDecided.has(q.vehicleId)));
}

/** Decisions made during this session, so the queue visibly drains in a demo. */
const qcDecided = new Set<string>();

export async function decideQc(vehicleId: string, pass: boolean, reason?: string): Promise<void> {
  const v = vehicles.find((x) => x.id === vehicleId);
  if (v) v.state = pass ? 'READY_TO_DEPLOY' : 'UNDER_REPAIR';
  qcDecided.add(vehicleId);
  // `reason` is required on a fail and goes to the audit log server-side.
  void reason;
  return delay(undefined, 320);
}

/** Bikes an inspection can be recorded against: returned, damaged, or in repair. */
export async function listInspectableVehicles(): Promise<Vehicle[]> {
  return delay(
    vehicles.filter((v) => v.state === 'RETURNED' || v.state === 'ACCIDENT' || v.state === 'DEPLOYED'),
  );
}

/** A bike with no recorded history still has its live assignment, if any. */
function currentAssignmentOnly(v: Vehicle) {
  if (!v.currentRiderId) return [];
  const rider = riders.find((r) => r.id === v.currentRiderId);
  if (!rider) return [];
  const started = new Date(rider.onboardedOn);
  const days = Math.max(1, Math.round((Date.now() - started.getTime()) / 86_400_000));
  return [
    {
      riderId: rider.id,
      riderName: rider.name,
      planAmount: rider.planAmount,
      startedOn: rider.onboardedOn,
      endedOn: null,
      days,
      closedBy: null,
    },
  ];
}
