import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServiceJob, recordServiceInspection, serviceJobs, updateServiceJobRecord } from './serviceJobs';
import { lifecycleByVehicle, vehicles } from './vehicles';
import { riders } from './riders';
import { riderCharges } from './riderCharges';
import { operationsSummary, serviceQueues } from './dashboard';
import { assignVehicle, deboardRider, exchangeVehicle } from '../lib/api/assignments';
import { decideQc, listInspectableVehicles, listQcQueue } from '../lib/api/vehicles';
import { getServiceJob, listServiceJobs } from '../lib/api/serviceJobs';
import { withLiveServiceFigures, runsByDay } from './payments';
import { listRiders } from '../lib/api/riders';
import { deboardRiderSchema, exchangeVehicleSchema } from '../lib/schemas/assignment';
import { RETURN_DESTINATIONS } from '../lib/serviceWorkflow';
import type { DeboardRiderRequest, ServiceJob, UpdateServiceJobRequest } from '../types';

vi.mock('../lib/api/client', async (original) => ({
  ...await original<typeof import('../lib/api/client')>(),
  delay: async <T,>(value: T) => value,
}));

const initialVehicles = structuredClone(vehicles);
const initialRiders = structuredClone(riders);
const initialJobs = structuredClone(serviceJobs);
const initialLifecycle = structuredClone(lifecycleByVehicle);
function reset() {
  vehicles.splice(0, vehicles.length, ...structuredClone(initialVehicles));
  riders.splice(0, riders.length, ...structuredClone(initialRiders));
  serviceJobs.splice(0);
  riderCharges.splice(0);
  for (const key of Object.keys(lifecycleByVehicle)) delete lifecycleByVehicle[key];
  Object.assign(lifecycleByVehicle, structuredClone(initialLifecycle));
}
beforeEach(reset);
afterEach(reset);

function intake(category: ServiceJob['damageCategory'] = 'MINOR') {
  const vehicle = vehicles.find((v) => v.state === 'DEPLOYED')!;
  const job = createServiceJob({ vehicleId: vehicle.id, riderId: vehicle.currentRiderId, source: 'RSA', damageCategory: category, damageNotes: 'Mirror cracked', location: 'Pickup at hub gate' });
  return { vehicle, job };
}
function update(job: ServiceJob, patch: Partial<UpdateServiceJobRequest> = {}) {
  return updateServiceJobRecord({
    jobId: job.id, queue: job.queue, damageCategory: job.damageCategory, workSummary: 'Mirror replaced and brakes checked',
    items: [], technician: 'Test technician', liability: 'COMPANY', reference: null,
    note: 'Checks completed', actor: 'Service operator', ...patch,
  });
}
function deboardBody(next: DeboardRiderRequest['nextVehicleState']): DeboardRiderRequest {
  const vehicle = vehicles.find((v) => v.state === 'DEPLOYED')!;
  return {
    vehicleId: vehicle.id, riderId: vehicle.currentRiderId!, returnedOn: '2026-09-18',
    returnCondition: 'MINOR', reason: 'SERVICE_ISSUE', nextVehicleState: next,
    damageItems: [{ part: 'Mirror', note: 'Cracked glass' }], note: 'Desk inspected and explicitly approved this destination',
    outstandingRent: 0, depositRefund: 0,
  };
}

describe('service workflow integrity', () => {
  it('imports every existing repair / accident / QC vehicle without inventing source or severity splits', () => {
    const held = initialVehicles.filter((v) => ['UNDER_REPAIR', 'QC_PENDING', 'ACCIDENT'].includes(v.state));
    expect(initialJobs).toHaveLength(held.length);
    expect(initialJobs.every((job) => job.source === 'REGISTRY')).toBe(true);
    expect(initialJobs.filter((job) => job.queue === 'ASSESSMENT')).toHaveLength(initialVehicles.filter((v) => v.state === 'UNDER_REPAIR').length);
  });

  it.each(['RSA', 'QRT', 'WALK_IN'] as const)('%s intake moves the vehicle but preserves the rider assignment', (source) => {
    const v = vehicles.find((v) => v.state === 'DEPLOYED')!;
    const riderId = v.currentRiderId;
    const job = createServiceJob({ vehicleId: v.id, riderId, source, damageCategory: 'MAJOR', damageNotes: 'Fork damage' });
    expect(v.state).toBe('UNDER_REPAIR');
    expect(v.currentRiderId).toBe(riderId);
    expect(riders.find((r) => r.id === riderId)?.currentVehicleId).toBe(v.id);
    expect(job.queue).toBe('MAJOR_REPAIR');
    expect(riderCharges).toHaveLength(0);
    expect(() => createServiceJob({ vehicleId: v.id, riderId, source, damageCategory: 'MAJOR', damageNotes: 'Fork damage' })).toThrow(/already has an open/);
    expect(serviceJobs).toHaveLength(1);
  });

  it('uses real categories and source records for counts', () => {
    const { job } = intake();
    expect(serviceQueues().underRepair.minor).toBe(1);
    expect(serviceQueues().underRepair.major).toBe(0);
    expect(serviceQueues().inService.rsa).toBe(1);
    update(job, { queue: 'MAJOR_REPAIR', damageCategory: 'MAJOR' });
    expect(serviceQueues().underRepair.minor).toBe(0);
    expect(serviceQueues().underRepair.major).toBe(1);
    const day = job.createdOn.slice(0, 10);
    expect(operationsSummary(day, day).source).toEqual({ rsa: 1, walkIn: 0, qrt: 0 });
  });

  it.each([
    ['NONE', 'QC_PENDING', 'QC_PENDING'],
    ['MINOR', 'MINOR_REPAIR', 'UNDER_REPAIR'],
    ['MAJOR', 'MAJOR_REPAIR', 'UNDER_REPAIR'],
    ['ACCIDENT', 'ACCIDENT', 'ACCIDENT'],
  ] as const)('routes %s intake to %s and %s', (category, queue, state) => {
    const result = intake(category);
    expect(result.job.queue).toBe(queue);
    expect(result.vehicle.state).toBe(state);
  });

  it('rejects intake release shortcuts, missing notes and stale rider links without writing anything', () => {
    const vehicle = vehicles.find((v) => v.state === 'DEPLOYED')!;
    const body = { vehicleId: vehicle.id, riderId: vehicle.currentRiderId, source: 'RSA' as const, damageCategory: 'NONE' as const, damageNotes: 'Safety check' };
    expect(() => createServiceJob({ ...body, queue: 'READY_TO_DEPLOY' })).toThrow(/before.*release/);
    expect(() => createServiceJob({ ...body, damageNotes: '' })).toThrow(/reported issue/);
    expect(() => createServiceJob({ ...body, riderId: null })).toThrow(/assignment changed/);
    expect(vehicle.state).toBe('DEPLOYED');
    expect(serviceJobs).toHaveLength(0);
  });

  it('returns isolated API snapshots so in-flight updates cannot change the visible draft', async () => {
    const { job } = intake();
    const detail = await getServiceJob(job.id);
    const list = await listServiceJobs();
    update(job, { queue: 'QC_PENDING' });
    expect(detail.queue).toBe('MINOR_REPAIR');
    expect(list[0].activity).toHaveLength(1);
    expect((await getServiceJob(job.id)).queue).toBe('QC_PENDING');
  });

  it('updates rider vehicle-state filters when an assigned bike enters service', async () => {
    const { job } = intake();
    const result = await listRiders({ vehicleState: 'UNDER_REPAIR', size: 1000 });
    expect(result.content.some((rider) => rider.id === job.riderId)).toBe(true);
  });

  it('requires real QC findings, work and technician rather than an empty generated prefix', () => {
    const { job } = intake();
    expect(() => update(job, { queue: 'QC_PENDING', workSummary: '' })).toThrow(/work done/);
    expect(() => update(job, { queue: 'QC_PENDING', technician: null })).toThrow(/technician/);
    expect(() => update(job, { queue: 'READY_TO_DEPLOY', note: 'QC passed: ' })).toThrow(/findings/);
    expect(job.queue).toBe('MINOR_REPAIR');
  });

  it.each(['WARRANTY', 'INSURANCE', 'PARTS_WAITING'] as const)('records %s references and prevents partial movement when they are missing', (queue) => {
    const { job, vehicle } = intake();
    expect(() => update(job, { queue })).toThrow(/reference|parts/);
    expect(job.queue).toBe('MINOR_REPAIR');
    expect(vehicle.state).toBe('UNDER_REPAIR');
    update(job, { queue, reference: 'Reference 123 / expected tomorrow' });
    expect(job.reference).toContain('123');
    expect(job.queue).toBe(queue);
    expect(job.activity.at(-1)?.queue).toBe(queue);
  });

  it('survives QC fail, repair, repeated QC and pass without duplicate charges or lost assignment', async () => {
    const { job, vehicle } = intake();
    const items = [{ kind: 'PART' as const, label: 'Mirror', costPaise: 120000 }];
    update(job, { queue: 'QC_PENDING', items, liability: 'RIDER' });
    expect(riderCharges).toHaveLength(0);
    expect((await listQcQueue()).some((q) => q.jobId === job.id)).toBe(true);
    await decideQc(vehicle.id, false, 'Mounting is loose', 'QC inspector');
    expect(vehicle.state).toBe('UNDER_REPAIR');
    expect((await listQcQueue()).some((q) => q.jobId === job.id)).toBe(false);
    update(job, { queue: 'QC_PENDING', items, liability: 'RIDER', note: 'Mounting tightened' });
    expect((await listQcQueue()).some((q) => q.jobId === job.id)).toBe(true);
    await decideQc(vehicle.id, true, 'Mounting and road test passed', 'QC inspector');
    expect(vehicle.state).toBe('DEPLOYED');
    expect(vehicle.currentRiderId).toBe(job.riderId);
    expect(job.status).toBe('CLOSED');
    expect(riderCharges).toHaveLength(1);
    const rider = riders.find((r) => r.id === job.riderId)!;
    const run = withLiveServiceFigures(runsByDay[rider.billingDay]);
    expect(run.rows.find((row) => row.riderId === job.riderId)?.serviceCharges).toBe(120000);
    expect(job.activity.some((e) => e.note.includes('Mounting is loose'))).toBe(true);
    expect(() => update(job, { queue: 'READY_TO_DEPLOY', items, liability: 'RIDER' })).toThrow(/already closed/);
    expect(riderCharges).toHaveLength(1);
  });

  it('supports zero-cost QC release into RTD for unassigned vehicles', async () => {
    const v = vehicles.find((v) => v.state === 'READY_TO_DEPLOY')!;
    const job = createServiceJob({ vehicleId: v.id, riderId: null, source: 'WALK_IN', damageCategory: 'NONE', damageNotes: 'Routine safety check' });
    await decideQc(v.id, true, 'No work required; all checks passed', 'Inspector');
    expect(v.state).toBe('READY_TO_DEPLOY');
    expect(job.items).toEqual([]);
    expect(job.status).toBe('CLOSED');
    expect(riderCharges).toHaveLength(0);
  });

  it('deducts deposit once and rejects an unaffordable deposit charge without mutation', () => {
    const { job } = intake();
    const rider = riders.find((r) => r.id === job.riderId)!;
    const before = rider.depositHeld;
    expect(() => update(job, { queue: 'READY_TO_DEPLOY', liability: 'DEPOSIT', items: [{ label: 'Repair', costPaise: before + 100 }] })).toThrow(/exceeds the deposit/);
    expect(job.status).toBe('OPEN');
    update(job, { queue: 'READY_TO_DEPLOY', liability: 'DEPOSIT', items: [{ label: 'Repair', costPaise: 100 }] });
    expect(rider.depositHeld).toBe(before - 100);
    expect(riderCharges).toHaveLength(1);
    expect(riderCharges[0].status).toBe('SETTLED');
  });

  it('retains inspection notes, estimated items, technician and lifecycle instead of discarding them', async () => {
    const { job, vehicle } = intake();
    recordServiceInspection({ vehicleId: vehicle.id, category: 'MAJOR', notes: 'Fork needs replacing', items: [{ label: 'Fork estimate', costPaise: 500000 }], estimatedCostPaise: 500000, technician: 'Inspector', nextState: 'UNDER_REPAIR' });
    expect(job.inspections[0]).toMatchObject({ notes: 'Fork needs replacing', technician: 'Inspector', estimatedCostPaise: 500000 });
    expect(job.queue).toBe('MAJOR_REPAIR');
    expect(job.totalCostPaise).toBe(0);
    expect(lifecycleByVehicle[vehicle.id].at(-1)?.note).toBe('Fork needs replacing');
    expect((await listInspectableVehicles()).some((v) => v.id === vehicle.id)).toBe(true);
  });

  it('rejects invalid work costs and never moves the vehicle on error', () => {
    const { job, vehicle } = intake();
    for (const costPaise of [-1, Number.NaN, Number.POSITIVE_INFINITY, 0.5]) {
      expect(() => update(job, { queue: 'QC_PENDING', items: [{ label: 'Repair', costPaise }] })).toThrow();
    }
    expect(vehicle.state).toBe('UNDER_REPAIR');
    expect(job.activity).toHaveLength(1);
  });

  it('rejects an incomplete standalone inspection before creating a job or moving the vehicle', () => {
    const vehicle = vehicles.find((v) => v.state === 'READY_TO_DEPLOY')!;
    expect(() => recordServiceInspection({ vehicleId: vehicle.id, category: 'MINOR', notes: 'Mirror check', items: [], estimatedCostPaise: 0, technician: null, nextState: 'UNDER_REPAIR' })).toThrow(/inspector/);
    expect(vehicle.state).toBe('READY_TO_DEPLOY');
    expect(serviceJobs).toHaveLength(0);
  });
});

describe('return disposition consistency', () => {
  it.each(RETURN_DESTINATIONS)('deboards atomically into %s and captures the same destination in the job', async (destination) => {
    const body = deboardBody(destination);
    await deboardRider(body);
    const vehicle = vehicles.find((v) => v.id === body.vehicleId)!;
    expect(vehicle.state).toBe(destination);
    expect(vehicle.currentRiderId).toBeNull();
    expect(riders.find((r) => r.id === body.riderId)?.status).toBe('INACTIVE');
    expect(serviceJobs).toHaveLength(1);
    expect(serviceJobs[0].damageNotes).toContain('Cracked glass');
    expect(serviceJobs[0].activity[0].vehicleState).toBe(destination);
  });

  it.each(RETURN_DESTINATIONS)('offers %s consistently in exchange and deboard validation', (destination) => {
    const body = deboardBody(destination);
    expect(deboardRiderSchema.safeParse({ ...body, outstandingRentRupees: 0, depositRefundRupees: 0 }).success).toBe(true);
    expect(exchangeVehicleSchema.safeParse({ riderId: body.riderId, fromVehicleId: body.vehicleId, toVehicleId: 'OTHER', occurredOn: body.returnedOn, reason: 'SERVICE_REQUIRED', returnCondition: body.returnCondition, nextVehicleState: destination, note: body.note, damageItems: body.damageItems }).success).toBe(true);
  });

  it.each(RETURN_DESTINATIONS)('exchanges atomically with the old bike routed to %s', async (destination) => {
    const body = deboardBody(destination);
    const replacement = vehicles.find((v) => v.state === 'READY_TO_DEPLOY')!;
    await exchangeVehicle({ riderId: body.riderId, fromVehicleId: body.vehicleId, toVehicleId: replacement.id, occurredOn: body.returnedOn, reason: 'SERVICE_REQUIRED', returnCondition: body.returnCondition, nextVehicleState: body.nextVehicleState, note: body.note, damageItems: body.damageItems });
    expect(replacement.currentRiderId).toBe(body.riderId);
    expect(vehicles.find((v) => v.id === body.vehicleId)?.state).toBe(destination);
    expect(serviceJobs[0].source).toBe('EXCHANGE');
    expect(serviceJobs[0].damageNotes).toContain('Mirror');
  });

  it('requires an override reason before changing assignment or job', async () => {
    const body = deboardBody('READY_TO_DEPLOY');
    await expect(deboardRider({ ...body, note: '' })).rejects.toThrow(/override/);
    expect(vehicles.find((v) => v.id === body.vehicleId)?.state).toBe('DEPLOYED');
    expect(serviceJobs).toHaveLength(0);
  });

  it('rejects missing damage details and an unclosed bill without partially deboarding', async () => {
    const body = deboardBody('UNDER_REPAIR');
    await expect(deboardRider({ ...body, damageItems: [] })).rejects.toThrow(/damaged parts/);
    const job = createServiceJob({ vehicleId: body.vehicleId, riderId: body.riderId, source: 'RSA', damageCategory: 'MINOR', damageNotes: 'Mirror broken' });
    update(job, { items: [{ label: 'Mirror', costPaise: 10000 }] });
    await expect(deboardRider({ ...body, nextVehicleState: 'READY_TO_DEPLOY' })).rejects.toThrow(/unclosed service costs/);
    expect(riders.find((r) => r.id === body.riderId)?.currentVehicleId).toBe(body.vehicleId);
    expect(job.status).toBe('IN_PROGRESS');
    expect(job.totalCostPaise).toBe(10000);
  });

  it('reuses an RSA job on later deboard and never leaves an assigned service bike available for reassignment', async () => {
    const body = deboardBody('UNDER_REPAIR');
    const job = createServiceJob({ vehicleId: body.vehicleId, riderId: body.riderId, source: 'RSA', damageCategory: 'MINOR', damageNotes: 'On-road issue' });
    await deboardRider(body);
    expect(serviceJobs).toHaveLength(1);
    expect(job.source).toBe('RSA');
    expect(job.damageNotes).toContain('Cracked glass');
    expect(job.activity.at(-1)?.note).toContain('DEBOARD');
    const assigned = vehicles.find((v) => v.state === 'DEPLOYED')!;
    assigned.state = 'READY_TO_DEPLOY';
    const rider = riders.find((r) => r.status === 'ACTIVE' && r.id !== assigned.currentRiderId)!;
    rider.currentVehicleId = null;
    await expect(assignVehicle({ riderId: rider.id, vehicleId: assigned.id, startedOn: '2026-09-18' })).rejects.toThrow(/not ready/);
  });
});
