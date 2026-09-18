import type {
  BatteryType,
  BulkUploadPreview,
  CreateVehicleRequest,
  Facet,
  InspectionRequest,
  Page,
  Vehicle,
  VehicleDetail,
  VehicleState,
  QcQueueItem,
  UpdateVehicleRequest,
} from '../../types';
import {
  assignmentsByVehicle,
  bulkUploadRows,
  deviceNumbers,
  lifecycleByVehicle,
  vehicles,
} from '../../mocks/vehicles';
import { ApiError, delay, paginate } from './client';
import { VEHICLE_STATE_LABEL } from '../labels';
import { riders } from '../../mocks/riders';
import { activeJobForVehicle, recordServiceInspection, serviceJobs, updateServiceJobRecord } from '../../mocks/serviceJobs';
import { hasServiceNote } from '../serviceWorkflow';

/** Derive the make from the model name. */
export function deriveMake(model: string): string {
  return model.startsWith('Eagle') ? 'e-Connects' : 'e-Sprinto';
}

export interface VehicleQuery {
  page?: number;
  size?: number;
  q?: string;
  state?: VehicleState | 'ALL';
  hub?: string | 'ALL';
  make?: string | 'ALL';
  batteryType?: BatteryType | 'ALL';
}

function match(v: Vehicle, query: VehicleQuery) {
  if (query.state && query.state !== 'ALL' && v.state !== query.state) return false;
  if (query.hub && query.hub !== 'ALL' && v.hub !== query.hub) return false;
  if (query.make && query.make !== 'ALL' && deriveMake(v.model) !== query.make) return false;
  if (query.batteryType && query.batteryType !== 'ALL' && v.batteryType !== query.batteryType) return false;
  const q = query.q?.trim().toLowerCase();
  if (!q) return true;
  // Everything printed on the row is searchable, because that is what the box
  // appears to promise. The hub is the one people actually type — "Koramangala"
  // is how a dispatcher asks which bikes are at their yard — and leaving it out
  // made the search look broken.
  return (
    v.id.toLowerCase().includes(q) ||
    v.chassisNumber.toLowerCase().includes(q) ||
    v.model.toLowerCase().includes(q) ||
    deriveMake(v.model).toLowerCase().includes(q) ||
    v.hub.toLowerCase().includes(q) ||
    v.batteryType.toLowerCase().includes(q) ||
    (v.batteryVendor ?? '').toLowerCase().includes(q) ||
    (v.currentRiderId ?? '').toLowerCase().includes(q) ||
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

/** Unique make and battery type values for filter dropdowns. */
export async function vehicleFilterOptions(): Promise<{ makes: string[]; batteryTypes: BatteryType[] }> {
  const makes = [...new Set(vehicles.map((v) => deriveMake(v.model)))].sort();
  const batteryTypes = [...new Set(vehicles.map((v) => v.batteryType))].sort() as BatteryType[];
  return delay({ makes, batteryTypes });
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
    iotNumber: deviceNumbers[v.id]?.iot ?? null,
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
    batteryVendor: body.batteryVendor ?? null,
    state: 'INDUCTED',
    currentRiderId: null,
    currentRiderName: null,
    odometerKm: 0,
  };
  vehicles.unshift(created);
  return delay(created, 420);
}

/** Corrects an existing vehicle's specification. Never touches its state, its
 *  rider, or its identity — those change through the assignment and
 *  inspection flows, not here. */
export async function updateVehicle(body: UpdateVehicleRequest): Promise<VehicleDetail> {
  const v = vehicles.find((x) => x.id === body.vehicleId);
  if (!v) throw new ApiError(`No vehicle with id ${body.vehicleId}`, 404);

  v.model = body.model;
  v.batteryType = body.batteryType;
  v.batteryVendor = body.batteryVendor ?? null;
  v.hub = body.hub;
  v.registrationNumber = body.registrationNumber ?? null;

  const existing = deviceNumbers[v.id];
  deviceNumbers[v.id] = {
    motor: body.motorNumber ?? existing?.motor ?? '',
    controller: body.controllerNumber ?? existing?.controller ?? '',
    rfid: body.rfidTag ?? existing?.rfid ?? '',
    iot: existing?.iot ?? null,
  };

  return delay(await getVehicle(v.id), 380);
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
  recordServiceInspection(body);
  return delay(v, 380);
}

/** Live QC membership; failed jobs may be repaired and submitted again. */
export async function listQcQueue(): Promise<QcQueueItem[]> {
  const today = Date.now();

  const items = vehicles
    .filter((v) => v.state === 'QC_PENDING')
    .map<QcQueueItem>((v) => {
      const job = activeJobForVehicle(v.id);
      const date = job?.updatedOn ?? v.inductedOn;
      return {
        vehicleId: v.id,
        jobId: job?.id,
        riderId: v.currentRiderId,
        model: v.model,
        repairSummary: job?.workSummary || job?.damageNotes || 'Inspection required',
        category: job?.damageCategory ?? 'NONE',
        technician: job?.technician ?? 'Not recorded',
        closedOn: date,
        costPaise: job?.totalCostPaise ?? 0,
        daysWaiting: Math.max(0, Math.floor((today - Date.parse(date)) / 86_400_000)),
      };
    });

  return delay(items.sort((a, b) => b.daysWaiting - a.daysWaiting));
}

export async function decideQc(vehicleId: string, pass: boolean, reason?: string, inspector = 'QC desk'): Promise<void> {
  const v = vehicles.find((x) => x.id === vehicleId);
  if (!v || v.state !== 'QC_PENDING') throw new ApiError('This vehicle is no longer awaiting QC', 409);
  const job = activeJobForVehicle(vehicleId);
  if (!job) throw new ApiError('Open a service record before recording QC', 409);
  if (!reason || !hasServiceNote(reason)) throw new ApiError('Record the QC findings before confirming', 400);
  updateServiceJobRecord({
    jobId: job.id, queue: pass ? 'READY_TO_DEPLOY' : job.damageCategory === 'MAJOR' || job.damageCategory === 'ACCIDENT' ? 'MAJOR_REPAIR' : 'MINOR_REPAIR',
    damageCategory: job.damageCategory, workSummary: job.workSummary || reason, items: job.items,
    technician: inspector, liability: job.liability ?? (job.totalCostPaise === 0 ? 'COMPANY' : null),
    reference: job.reference, note: `QC ${pass ? 'passed' : 'failed'}: ${reason}`, actor: inspector,
  });
  return delay(undefined, 320);
}

/** An assigned bike can visit service without ending its rider assignment. */
export async function listInspectableVehicles(): Promise<Vehicle[]> {
  return delay(
    vehicles.filter((v) => v.state !== 'RETIRED'),
  );
}

export async function getVehicleServiceHistory(vehicleId: string) {
  return delay(serviceJobs.filter((job) => job.vehicleId === vehicleId).map((job) => ({ ...job })));
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
