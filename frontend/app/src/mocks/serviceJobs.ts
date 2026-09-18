import type { CreateServiceJobRequest, ServiceJob, ServiceJobItem, CloseServiceJobRequest } from '../types';
import { addRiderCharge } from './riderCharges';

/**
 * OWNER: SMK (contract + mock). Every job the workshop and the assistance
 * desk work — a deboard's damage tag, an RSA/QRT call, a walk-in — lands in
 * this one list, so the service-queue counts and the assistance desk read the
 * same records rather than two guesses at the same work.
 */
let nextId = 1;
export const serviceJobs: ServiceJob[] = [];

const iso = () => new Date().toISOString().slice(0, 10);

/** Opened by a deboard's damage tag, an RSA/QRT dispatch, or a walk-in. */
export function createServiceJob(req: CreateServiceJobRequest): ServiceJob {
  const job: ServiceJob = {
    id: `SVC-${String(nextId++).padStart(4, '0')}`,
    vehicleId: req.vehicleId,
    riderId: req.riderId,
    source: req.source,
    damageCategory: req.damageCategory,
    damageNotes: req.damageNotes ?? null,
    items: [],
    totalCostPaise: 0,
    liability: null,
    status: 'OPEN',
    technician: null,
    createdOn: iso(),
    closedOn: null,
  };
  serviceJobs.push(job);
  return job;
}

function totalOf(items: ServiceJobItem[]) {
  return items.reduce((sum, item) => sum + item.costPaise, 0);
}

/**
 * Closing a job prices the work and says who pays for it. A `RIDER` or
 * `DEPOSIT` liability posts a `RiderCharge` in the same call — that is the
 * one place a service cost turns into money owed, so the weekly run's
 * `serviceCharges`/`arrears` columns (mocks/payments.ts) can never disagree
 * with what the assistance desk actually closed.
 */
export function closeServiceJobRecord(req: CloseServiceJobRequest): ServiceJob {
  const job = serviceJobs.find((j) => j.id === req.jobId);
  if (!job) throw new Error(`No service job with id ${req.jobId}`);

  job.items = req.items;
  job.totalCostPaise = totalOf(req.items);
  job.liability = req.liability;
  job.technician = req.technician;
  job.status = 'CLOSED';
  job.closedOn = iso();

  if (job.riderId && job.totalCostPaise > 0 && req.liability !== 'COMPANY') {
    addRiderCharge({
      riderId: job.riderId,
      serviceJobId: job.id,
      vehicleId: job.vehicleId,
      amount: job.totalCostPaise,
      liability: req.liability,
    });
  }

  return job;
}
