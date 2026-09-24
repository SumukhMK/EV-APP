import type { InspectionRequest, QcQueueItem, Vehicle } from '../../types';
import { vehicles } from '../../mocks/vehicles';
import { activeJobForVehicle, recordServiceInspection, serviceJobs, updateServiceJobRecord } from '../../mocks/serviceJobs';
import { delay } from './client';
import { ApiError } from './client';
import { hasServiceNote } from '../serviceWorkflow';

/**
 * Inspection and QC — the service module's read/write surface, which is stage
 * S4.
 *
 * Split out of vehicles.ts so each file swaps from mock to real in one piece:
 * vehicles.ts at S1, this one at S4. WORK_SPLIT.md promises that finishing a
 * backend stage changes exactly one frontend file, and that promise cannot
 * hold while one file spans two stages.
 */
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
