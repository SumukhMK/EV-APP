import type { CloseServiceJobRequest, CreateServiceJobRequest, ServiceJob, ServiceJobStatus, UpdateServiceJobRequest } from '../../types';
import { serviceJobs, createServiceJob as createServiceJobRecord, closeServiceJobRecord, updateServiceJobRecord } from '../../mocks/serviceJobs';
import { ApiError, delay } from './client';

/**
 * OWNER: SMK. The service-job queue: opened by a deboard's damage tag, an
 * RSA/QRT dispatch, or a walk-in; worked and priced by the assistance desk.
 */

export async function listServiceJobs(status?: ServiceJobStatus): Promise<ServiceJob[]> {
  const rows = status ? serviceJobs.filter((j) => j.status === status) : serviceJobs;
  return delay(structuredClone([...rows].reverse()));
}

export async function getServiceJob(id: string): Promise<ServiceJob> {
  const job = serviceJobs.find((j) => j.id === id);
  if (!job) throw new ApiError(`No service job with id ${id}`, 404);
  return delay(structuredClone(job));
}

export async function createServiceJob(body: CreateServiceJobRequest): Promise<ServiceJob> {
  return delay(structuredClone(createServiceJobRecord(body)), 300);
}

export async function closeServiceJob(body: CloseServiceJobRequest): Promise<ServiceJob> {
  return delay(structuredClone(closeServiceJobRecord(body)), 380);
}

export async function updateServiceJob(body: UpdateServiceJobRequest): Promise<ServiceJob> {
  return delay(structuredClone(updateServiceJobRecord(body)), 320);
}
