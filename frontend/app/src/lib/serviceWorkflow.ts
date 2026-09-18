import { SERVICE_QUEUES, type DamageCategory, type ServiceJob, type ServiceQueue, type VehicleState } from '../types';

/**
 * Return disposition — where the vehicle goes when a rider brings it back.
 * READY_TO_DEPLOY removed: every return must go through QC or service first.
 */
export const RETURN_DESTINATIONS = ['QC_PENDING', 'UNDER_REPAIR', 'ACCIDENT'] as const;
export type ReturnDestination = (typeof RETURN_DESTINATIONS)[number];

export const QUEUE_STATE: Record<ServiceQueue, VehicleState> = {
  ASSESSMENT: 'UNDER_REPAIR',
  MINOR_REPAIR: 'UNDER_REPAIR',
  MAJOR_REPAIR: 'UNDER_REPAIR',
  ACCIDENT: 'ACCIDENT',
  WARRANTY: 'UNDER_REPAIR',
  INSURANCE: 'UNDER_REPAIR',
  PARTS_WAITING: 'UNDER_REPAIR',
  QC_PENDING: 'QC_PENDING',
  READY_TO_DEPLOY: 'READY_TO_DEPLOY',
};

export function isServiceQueue(value: string): value is ServiceQueue {
  return (SERVICE_QUEUES as readonly string[]).includes(value);
}

export function hasServiceNote(note: string): boolean {
  return Boolean(note.replace(/^QC (passed|failed):\s*/i, '').trim());
}

export function needsDamageAssessment(job: ServiceJob): boolean {
  return job.source === 'REGISTRY' && job.queue === 'ASSESSMENT' && job.status === 'OPEN' && !job.inspections.length;
}

export function queueForCondition(category: DamageCategory): ServiceQueue {
  return category === 'NONE' ? 'QC_PENDING' : category === 'ACCIDENT' ? 'ACCIDENT' : category === 'MAJOR' ? 'MAJOR_REPAIR' : 'MINOR_REPAIR';
}

export function queueForDisposition(state: VehicleState, category: DamageCategory): ServiceQueue {
  if (state === 'READY_TO_DEPLOY' || state === 'QC_PENDING' || state === 'ACCIDENT') return state;
  return category === 'MAJOR' || category === 'ACCIDENT' ? 'MAJOR_REPAIR' : category === 'MINOR' ? 'MINOR_REPAIR' : 'ASSESSMENT';
}

/**
 * After QC passes, vehicle always goes to RTD. Rider was decoupled at receipt
 * generation (in UNDER_REPAIR). Re-assignment happens at RTD, even for the
 * same rider — keeps the lifecycle clean.
 */
export function releaseState(_assignedRiderId: string | null): VehicleState {
  return 'READY_TO_DEPLOY';
}
