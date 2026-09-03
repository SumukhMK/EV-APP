import type { Iso8601 } from './common';

/**
 * The vehicle lifecycle. Ashok's registry only ever describes a bike as being
 * in one of these; the transitions are enforced server-side later, and in the
 * UI today by `allowedTransitions` below.
 */
export const VEHICLE_STATES = [
  'INDUCTED',
  'READY_TO_DEPLOY',
  'DEPLOYED',
  'RETURNED',
  'UNDER_REPAIR',
  'QC_PENDING',
  'ACCIDENT',
  'RETIRED',
] as const;

export type VehicleState = (typeof VEHICLE_STATES)[number];

export type BatteryType = 'SWAPPABLE' | 'FIXED';

export interface Vehicle {
  /** Human-facing registry id, e.g. "BLRSS0428". Unique per tenant. */
  id: string;
  chassisNumber: string;
  model: string;
  batteryType: BatteryType;
  /** Free text today; becomes a hub reference when hubs are modelled. */
  hub: string;
  state: VehicleState;
  /** Present only while state is DEPLOYED. */
  currentRiderId: string | null;
  currentRiderName: string | null;
  inductedOn: Iso8601;
  registrationNumber: string | null;
  odometerKm: number | null;
}

/** One row of the vehicle's state history, oldest first. */
export interface VehicleLifecycleEvent {
  state: VehicleState;
  occurredOn: Iso8601;
  note: string | null;
  actor: string | null;
}

/** One closed or open assignment of this bike to a rider. */
export interface AssignmentHistoryRow {
  riderId: string;
  riderName: string;
  planAmount: number;
  startedOn: Iso8601;
  /** null while the assignment is still open. */
  endedOn: Iso8601 | null;
  days: number;
  closedBy: string | null;
}

export interface VehicleDetail extends Vehicle {
  make: string;
  motorNumber: string | null;
  controllerNumber: string | null;
  rfidTag: string | null;
  purchaseDate: Iso8601 | null;
  lifecycle: VehicleLifecycleEvent[];
  assignments: AssignmentHistoryRow[];
}

export interface CreateVehicleRequest {
  id: string;
  chassisNumber: string;
  model: string;
  batteryType: BatteryType;
  hub: string;
  registrationNumber?: string;
  inductedOn: Iso8601;
}

/** Server response to a dry-run bulk upload — the preview table on screen 06. */
export interface BulkUploadRow {
  rowNumber: number;
  id: string;
  chassisNumber: string;
  model: string;
  /** null means the row will import cleanly. */
  error: string | null;
}

export interface BulkUploadPreview {
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: BulkUploadRow[];
}

/** Screen 13: an inspection recorded against a returned or damaged vehicle. */
export type DamageCategory = 'NONE' | 'MINOR' | 'MAJOR' | 'ACCIDENT';

export interface InspectionRequest {
  vehicleId: string;
  category: DamageCategory;
  notes: string;
  estimatedCostPaise: number | null;
  /** The state the vehicle moves into once the inspection is saved. */
  nextState: VehicleState;
}

/** One repair job waiting on QC (screen 14). */
export interface QcQueueItem {
  vehicleId: string;
  model: string;
  repairSummary: string;
  category: DamageCategory | 'WARRANTY';
  technician: string;
  closedOn: Iso8601;
  costPaise: number;
  daysWaiting: number;
}
