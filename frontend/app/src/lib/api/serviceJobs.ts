import type { CloseServiceJobRequest, CreateServiceJobRequest, ServiceJob, ServiceJobStatus } from '../../types';
import { serviceJobs, createServiceJob as createServiceJobRecord, closeServiceJobRecord } from '../../mocks/serviceJobs';
import { ApiError, delay } from './client';

/**
 * OWNER: SMK. The service-job queue: opened by a deboard's damage tag, an
 * RSA/QRT dispatch, or a walk-in; worked and priced by the assistance desk.
 */

export async function listServiceJobs(status?: ServiceJobStatus): Promise<ServiceJob[]> {
  const rows = status ? serviceJobs.filter((j) => j.status === status) : serviceJobs;
  return delay([...rows].reverse());
}

export async function getServiceJob(id: string): Promise<ServiceJob> {
  const job = serviceJobs.find((j) => j.id === id);
  if (!job) throw new ApiError(`No service job with id ${id}`, 404);
  return delay(job);
}

export async function createServiceJob(body: CreateServiceJobRequest): Promise<ServiceJob> {
  return delay(createServiceJobRecord(body), 300);
}

export async function closeServiceJob(body: CloseServiceJobRequest): Promise<ServiceJob> {
  if (body.items.length === 0) {
    throw new ApiError('Add at least one line item before closing the job', 400, 'items');
  }
  return delay(closeServiceJobRecord(body), 380);
}
