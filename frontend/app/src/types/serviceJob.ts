import type { Iso8601, Paise } from './common';
import type { DamageCategory, InspectionRequest, VehicleState } from './vehicle';

/**
 * OWNER: SMK. A `ServiceJob` is what a deboard's damage tag, an RSA call, a
 * QRT call or a walk-in all turn into: one record that the assistance desk
 * works, closes, and — if the rider is on the hook for any of it — turns into
 * a `RiderCharge` (types/payment.ts).
 *
 * The damage tag decides the route, not the other way round: `NONE` sends the
 * bike to QC, `MINOR`/`MAJOR` to repair, `ACCIDENT` to the accident queue —
 * mirroring `CONDITION_DEFAULT_STATE` in lib/labels.ts, which the deboard form
 * already uses to default `nextVehicleState`.
 */
export type ServiceJobSource = 'DEBOARD' | 'EXCHANGE' | 'RSA' | 'QRT' | 'WALK_IN' | 'INSPECTION' | 'REGISTRY';

export const SERVICE_QUEUES = [
  'ASSESSMENT', 'MINOR_REPAIR', 'MAJOR_REPAIR', 'ACCIDENT', 'WARRANTY',
  'INSURANCE', 'PARTS_WAITING', 'QC_PENDING', 'READY_TO_DEPLOY',
] as const;
export type ServiceQueue = (typeof SERVICE_QUEUES)[number];

export type ServiceJobStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

/** Who ends up paying for the job once it is closed. */
export type ServiceLiability = 'DEPOSIT' | 'RIDER' | 'COMPANY';

/** One priced line of work — a part, a labour charge, a consumable. */
export interface ServiceJobItem {
  label: string;
  costPaise: Paise;
  kind?: 'PART' | 'LABOUR' | 'OTHER';
}

export interface ServiceJobEvent {
  occurredOn: Iso8601;
  actor: string;
  queue: ServiceQueue;
  vehicleState: VehicleState;
  note: string;
}

export interface ServiceInspection extends InspectionRequest {
  occurredOn: Iso8601;
  actor: string;
}

export interface ServiceJob {
  id: string;
  vehicleId: string;
  riderId: string | null;
  source: ServiceJobSource;
  damageCategory: DamageCategory;
  queue: ServiceQueue;
  location: string | null;
  reference: string | null;
  workSummary: string;
  activity: ServiceJobEvent[];
  inspections: ServiceInspection[];
  /** Free text from the tag step — what the operator saw, part by part. */
  damageNotes: string | null;
  items: ServiceJobItem[];
  /** Sum of `items`; kept as its own field so a closed job's total cannot be
   *  recomputed differently from what was actually charged. */
  totalCostPaise: Paise;
  liability: ServiceLiability | null;
  status: ServiceJobStatus;
  technician: string | null;
  createdOn: Iso8601;
  closedOn: Iso8601 | null;
  updatedOn: Iso8601;
}

/** What opening a job from a deboard, RSA/QRT call, or walk-in sends. */
export interface CreateServiceJobRequest {
  vehicleId: string;
  riderId: string | null;
  source: ServiceJobSource;
  damageCategory: DamageCategory;
  damageNotes?: string | null;
  queue?: ServiceQueue;
  location?: string | null;
  reference?: string | null;
  actor?: string;
  occurredOn?: Iso8601;
}

/** What the assistance desk sends when it closes a job. */
export interface CloseServiceJobRequest {
  jobId: string;
  items: ServiceJobItem[];
  liability: ServiceLiability;
  technician: string | null;
  note?: string;
  actor?: string;
}

export interface UpdateServiceJobRequest {
  jobId: string;
  queue: ServiceQueue;
  damageCategory: DamageCategory;
  workSummary: string;
  items: ServiceJobItem[];
  technician: string | null;
  liability: ServiceLiability | null;
  reference: string | null;
  note: string;
  actor: string;
  inspection?: InspectionRequest;
}
