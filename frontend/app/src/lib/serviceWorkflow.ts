import { SERVICE_QUEUES, type DamageCategory, type Paise, type ServiceJob, type ServiceJobCategory, type ServiceJobItem, type ServiceJobSource, type ServiceQueue, type VehicleState } from '../types';
import type { StatusTone } from '../theme/tokens';

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
/**
 * Where the bike goes when the workshop releases it: back to the rider who
 * still holds it, or into the free pool. Mirrors ServiceJobService.releaseTarget.
 */
export function releaseState(assignedRiderId: string | null): VehicleState {
  return assignedRiderId ? 'DEPLOYED' : 'READY_TO_DEPLOY';
}

/**
 * Which board owns a job. The server derives this the same way when the job
 * opens (SERVICE_INFRA_SPLIT.md, "Category from source"): an active rider's
 * bike is Walk-in & RSA, everything else is hub work.
 */
export function categoryOf(source: ServiceJobSource): ServiceJobCategory {
  return source === 'WALK_IN' || source === 'RSA' ? 'WALK_IN_RSA' : 'HUB';
}

/**
 * The one status a job card shows, everywhere: both boards, their counts and
 * the job page. Read off the queue, not stored. Walk-in and hub cards use the
 * same four words so an operator never has to translate between screens.
 */
export type JobStage = 'UNDER_REPAIR' | 'PARTS_WAITING' | 'QC_PENDING' | 'CLOSED';

export const JOB_STAGE_LABEL: Record<JobStage, string> = {
  UNDER_REPAIR: 'Under Repair', PARTS_WAITING: 'Parts Waiting', QC_PENDING: 'QC Pending', CLOSED: 'Closed',
};

export const JOB_STAGE_TONE: Record<JobStage, StatusTone> = {
  UNDER_REPAIR: 'caution', PARTS_WAITING: 'warn', QC_PENDING: 'accent', CLOSED: 'neutral',
};

export function jobStage(job: Pick<ServiceJob, 'queue' | 'status'>): JobStage {
  // Released means done: a bike back on the road has nothing left on its card.
  if (job.status === 'CLOSED' || job.queue === 'READY_TO_DEPLOY') return 'CLOSED';
  if (job.queue === 'PARTS_WAITING') return 'PARTS_WAITING';
  if (job.queue === 'QC_PENDING') return 'QC_PENDING';
  return 'UNDER_REPAIR';
}

/**
 * What a Walk-in & RSA job adds to Weekly Payments when the rider is liable:
 * the unpaid spare-parts balance. Labour is never charged to the rider.
 */
export function walkInRiderCharge(items: ServiceJobItem[], partsPaidPaise: Paise): Paise {
  const parts = items.reduce((sum, item) => sum + (item.kind === 'PART' ? item.costPaise : 0), 0);
  return Math.max(0, parts - partsPaidPaise);
}
