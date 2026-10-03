import type { CloseServiceJobRequest, CreateServiceJobRequest, Page, ServiceJob, ServiceJobStatus, UpdateServiceJobRequest } from '../../types';
import { request } from './client';

/**
 * The service-job module against the real API (S4).
 *
 * `listServiceJobs()` is called from three screens with no arguments,
 * expecting the whole list — a contract from when this module was mock-only
 * and the array lived in memory. The API never returns "all" in one page
 * (docs/BUILD.md), so this loops pages at the server's max size and
 * concatenates, keeping every existing call site unchanged.
 *
 * `updateServiceJob` does more than a PUT. The mock's `updateServiceJobRecord`
 * is one function that can save, submit QC and close in the same call; the
 * real API is three endpoints (`PUT /jobs/{id}`, `POST /jobs/{id}/qc`,
 * `POST /jobs/{id}/close`) because saving, deciding QC and deciding who pays
 * are different RBAC rules (docs/backend/RBAC.md). Rather than teach
 * AssistanceJob.tsx three call shapes, this function reads the same request
 * the mock already understands and sequences the real calls itself:
 *   - `qcChecks` present and the target queue is not QC_PENDING (QC_FAIL or
 *     RELEASE — never a bare "save progress" while still in QC, which sends
 *     the current, unchanged queue) submits the checklist first.
 *   - target queue READY_TO_DEPLOY with a liability closes the job next
 *     (after QC, if QC ran) — that finalises the cost and releases the bike.
 *   - anything else is a plain working save.
 */
const MAX_PAGE_SIZE = 100;

/**
 * The API's `inspections` are QC attempts, not routine inspections.
 *
 * Two different things share that name. `ServiceJob.inspections` on this side
 * is the older mock-only "routine inspection" concept, whose rows carry a
 * category, a technician and a list of priced `items`. The API's field of the
 * same name carries `QcInspectionResponse` — the nine-check safety gate, with
 * `checks`, `passed` and an inspector, and no `items` at all.
 *
 * Passing the response straight through therefore put QC rows into a field the
 * job screen renders as routine inspections, and the first thing that render
 * does is `inspection.items.map(...)`. Live, `items` is undefined, so passing
 * QC crashed the screen with "Cannot read properties of undefined (reading
 * 'map')" the moment the job came back.
 *
 * They are routed to `qcInspections` here, which is the field that matches
 * their shape and which the screen already renders correctly. `inspections`
 * stays empty live, because that concept has no backend.
 */
function toJob(raw: ServiceJob): ServiceJob {
  const qc = (raw as ServiceJob & { inspections?: unknown[] }).inspections;
  return {
    ...raw,
    inspections: [],
    qcInspections: (Array.isArray(qc) ? qc : []) as ServiceJob['qcInspections'],
  };
}

export async function listServiceJobs(status?: ServiceJobStatus): Promise<ServiceJob[]> {
  const all: ServiceJob[] = [];
  let page = 0;
  for (;;) {
    const chunk: Page<ServiceJob> = await request<Page<ServiceJob>>('/service/jobs', {
      query: { status, page, size: MAX_PAGE_SIZE },
    });
    all.push(...chunk.content.map(toJob));
    if (all.length >= chunk.totalElements || chunk.content.length === 0) break;
    page += 1;
  }
  return all;
}

export function getServiceJob(id: string): Promise<ServiceJob> {
  return request<ServiceJob>(`/service/jobs/${encodeURIComponent(id)}`).then(toJob);
}

export function createServiceJob(body: CreateServiceJobRequest): Promise<ServiceJob> {
  return request<ServiceJob>('/service/jobs', { method: 'POST', body }).then(toJob);
}

export function closeServiceJob(body: CloseServiceJobRequest): Promise<ServiceJob> {
  const { jobId, actor: _actor, ...rest } = body;
  void _actor; // the actor comes from the JWT on the API, not the body
  return request<ServiceJob>(`/service/jobs/${encodeURIComponent(jobId)}/close`, { method: 'POST', body: rest })
    .then(toJob);
}

export async function updateServiceJob(body: UpdateServiceJobRequest): Promise<ServiceJob> {
  const { jobId, qcChecks, inspection: _inspection, liability, actor: _actor, ...rest } = body;
  void _inspection; // no backend equivalent — the mock-only "routine inspection" concept
  void _actor;
  const id = encodeURIComponent(jobId);

  if (qcChecks && rest.queue !== 'QC_PENDING') {
    await request(`/service/jobs/${id}/qc`, {
      method: 'POST',
      body: { checks: qcChecks, inspector: rest.technician || 'QC desk', notes: rest.note },
    });
    if (rest.queue === 'READY_TO_DEPLOY' && liability) {
      return request<ServiceJob>(`/service/jobs/${id}/close`, {
        method: 'POST',
        body: { items: rest.items, liability, technician: rest.technician, note: rest.note },
      }).then(toJob);
    }
    // QC failed and sent the bike back for rework: the API already moved the
    // queue and vehicle state as part of the QC decision, so re-read it
    // instead of also issuing the plain update below.
    return getServiceJob(jobId);
  }

  return request<ServiceJob>(`/service/jobs/${id}`, { method: 'PUT', body: rest }).then(toJob);
}
