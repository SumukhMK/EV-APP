import type {
  CloseServiceJobRequest, CreateServiceJobRequest, DamageCategory, InspectionRequest, ServiceJob,
  ServiceJobItem, UpdateServiceJobRequest, Vehicle, VehicleState,
} from '../types';
import { ApiError } from '../lib/api/client';
import { hasServiceNote, isServiceQueue, QUEUE_STATE, RETURN_DESTINATIONS, queueForCondition, queueForDisposition, releaseState } from '../lib/serviceWorkflow';
import { addRiderCharge } from './riderCharges';
import { riders } from './riders';
import { lifecycleByVehicle, qcRepairDetails, vehicles } from './vehicles';

const iso = () => new Date().toISOString();
let nextId = 1;

function makeJob(req: CreateServiceJobRequest): ServiceJob {
  const queue = req.queue ?? queueForCondition(req.damageCategory);
  const date = req.occurredOn ?? iso();
  return {
    id: `SVC-${String(nextId++).padStart(4, '0')}`, vehicleId: req.vehicleId,
    riderId: req.riderId, source: req.source, damageCategory: req.damageCategory,
    queue, damageNotes: req.damageNotes ?? null, location: req.location ?? null,
    reference: req.reference?.trim() || null, workSummary: '', activity: [], inspections: [],
    items: [], totalCostPaise: 0, liability: null, technician: null,
    status: queue === 'READY_TO_DEPLOY' ? 'CLOSED' : 'OPEN',
    createdOn: date, updatedOn: date, closedOn: queue === 'READY_TO_DEPLOY' ? date : null,
  };
}

// Existing vehicles enter the workbench without inventing repair severities or sources.
export const serviceJobs: ServiceJob[] = vehicles
  .filter((v) => ['UNDER_REPAIR', 'QC_PENDING', 'ACCIDENT'].includes(v.state))
  .map((v) => {
    const detail = qcRepairDetails[v.id];
    const job = makeJob({
      vehicleId: v.id, riderId: v.currentRiderId, source: 'REGISTRY',
      damageCategory: v.state === 'ACCIDENT' ? 'ACCIDENT' : detail?.category === 'MINOR' || detail?.category === 'MAJOR' ? detail.category : 'NONE',
      queue: v.state === 'QC_PENDING' ? 'QC_PENDING' : v.state === 'ACCIDENT' ? 'ACCIDENT' : 'ASSESSMENT',
      damageNotes: detail?.repairSummary ?? 'Migrated fleet record. Assess and record the findings before release.',
      occurredOn: detail?.closedOn ?? v.inductedOn,
    });
    job.technician = detail?.technician ?? null;
    return job;
  });

export function activeJobForVehicle(vehicleId: string) {
  return serviceJobs.find((job) => job.vehicleId === vehicleId && job.status !== 'CLOSED');
}

export function requireServiceVehicle(vehicleId: string) {
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) throw new ApiError(`We could not find bike ${vehicleId}`, 404, 'vehicleId');
  if (vehicle.state === 'RETIRED') throw new ApiError('This bike has been scrapped, so it cannot go in for service', 409, 'vehicleId');
  return vehicle;
}

export function recordVehicleMovement(vehicle: Vehicle, next: VehicleState, note: string, actor: string, date = iso()) {
  const history = lifecycleByVehicle[vehicle.id] ?? [{
    state: vehicle.state, occurredOn: date, note: 'State before first recorded movement', actor,
  }];
  history.push({ state: next, occurredOn: date, note, actor });
  lifecycleByVehicle[vehicle.id] = history;
  vehicle.state = next;
}

function recordEvent(job: ServiceJob, vehicle: Vehicle, note: string, actor: string, date = iso()) {
  job.updatedOn = date;
  job.activity.push({ occurredOn: date, actor, note, queue: job.queue, vehicleState: vehicle.state });
}

export function createServiceJob(req: CreateServiceJobRequest): ServiceJob {
  const vehicle = requireServiceVehicle(req.vehicleId);
  validateCategory(req.damageCategory);
  if (!['DEBOARD', 'EXCHANGE', 'RSA', 'QRT', 'WALK_IN', 'INSPECTION', 'REGISTRY'].includes(req.source)) throw new ApiError('Pick how the bike reached us', 400, 'source');
  if (req.riderId !== vehicle.currentRiderId) throw new ApiError('This bike was given to someone else in the meantime. Refresh the page and try again.', 409, 'riderId');
  if (!req.damageNotes?.trim()) throw new ApiError('Say what is wrong with the bike, or why you are checking it', 400, 'damageNotes');
  if (req.queue && !isServiceQueue(req.queue)) throw new ApiError('That list does not exist', 400, 'queue');
  if (req.queue === 'READY_TO_DEPLOY') throw new ApiError('Take the bike in first. You can send it back out once the work is done.', 400, 'queue');
  if (req.queue && ['WARRANTY', 'INSURANCE', 'PARTS_WAITING'].includes(req.queue) && !req.reference?.trim()) throw new ApiError('Add the claim number, or say which parts you are waiting for', 400, 'reference');
  if (activeJobForVehicle(vehicle.id)) throw new ApiError('This bike already has an open job. Open that one instead.', 409, 'vehicleId');
  const job = makeJob(req);
  serviceJobs.push(job);
  const target = QUEUE_STATE[job.queue];
  const note = req.damageNotes?.trim() || 'Service intake';
  recordVehicleMovement(vehicle, target, note, req.actor ?? 'Fleet desk', job.createdOn);
  recordEvent(job, vehicle, note, req.actor ?? 'Fleet desk', job.createdOn);
  return job;
}

/** Validate first, then detach and route in one synchronous mutation. */
export function recordServiceReturn(vehicle: Vehicle, req: {
  riderId: string; source: 'DEBOARD' | 'EXCHANGE'; category: ServiceJob['damageCategory'];
  nextState: VehicleState; note: string; date: string;
}) {
  validateCategory(req.category);
  if (!(RETURN_DESTINATIONS as readonly string[]).includes(req.nextState)) throw new ApiError('Pick one: Ready to give out, Under repair, Final check, or Accident', 400, 'nextVehicleState');
  const existing = activeJobForVehicle(vehicle.id);
  if (existing && existing.totalCostPaise > 0 && req.nextState === 'READY_TO_DEPLOY') {
    throw new ApiError('This bike still has an open service job with costs on it. Finish that job before marking the bike ready to give out.', 409, 'nextVehicleState');
  }
  const queue = queueForDisposition(req.nextState, req.category);
  const job = existing ?? makeJob({
    vehicleId: vehicle.id, riderId: req.riderId, source: req.source, damageCategory: req.category,
    queue, damageNotes: req.note, occurredOn: req.date,
  });
  if (!existing) serviceJobs.push(job);
  job.queue = queue;
  job.riderId = req.riderId;
  job.damageCategory = req.category;
  job.damageNotes = existing ? [existing.damageNotes, req.note].filter(Boolean).join('\n') : req.note;
  job.status = queue === 'READY_TO_DEPLOY' ? 'CLOSED' : 'OPEN';
  job.closedOn = queue === 'READY_TO_DEPLOY' ? req.date : null;
  vehicle.currentRiderId = null;
  vehicle.currentRiderName = null;
  recordVehicleMovement(vehicle, req.nextState, req.note, 'Fleet desk', req.date);
  recordEvent(job, vehicle, `${req.source}: ${req.note}`, 'Fleet desk', req.date);
  return job;
}

export function validateServiceItems(items: ServiceJobItem[]) {
  if (items.some((item) => !item.label.trim() || !Number.isSafeInteger(item.costPaise) || item.costPaise < 0)) {
    throw new ApiError('Every cost line needs a short description and an amount of ₹0 or more', 400, 'items');
  }
  const total = items.reduce((sum, item) => sum + item.costPaise, 0);
  if (!Number.isSafeInteger(total)) throw new ApiError('That total is too large', 400, 'items');
  return total;
}

function validateCategory(category: DamageCategory) {
  if (!['NONE', 'MINOR', 'MAJOR', 'ACCIDENT'].includes(category)) throw new ApiError('Pick how bad the damage is', 400, 'damageCategory');
}

export function updateServiceJobRecord(req: UpdateServiceJobRequest): ServiceJob {
  const job = serviceJobs.find((j) => j.id === req.jobId);
  if (!job) throw new ApiError(`We could not find job ${req.jobId}`, 404);
  if (job.status === 'CLOSED') throw new ApiError('This job is already finished', 409);
  if (!isServiceQueue(req.queue)) throw new ApiError('That list does not exist', 400, 'queue');
  validateCategory(req.damageCategory);
  if (req.liability && !['RIDER', 'DEPOSIT', 'COMPANY'].includes(req.liability)) throw new ApiError('Pick who pays', 400, 'liability');
  const vehicle = requireServiceVehicle(job.vehicleId);
  const total = validateServiceItems(req.items);
  if (!hasServiceNote(req.note)) throw new ApiError('Write what you found, or why you are making this change', 400, 'note');
  if (['WARRANTY', 'INSURANCE', 'PARTS_WAITING'].includes(req.queue) && !req.reference?.trim()) {
    throw new ApiError('Add the claim number, or say which parts you are waiting for', 400, 'reference');
  }
  const releasing = req.queue === 'READY_TO_DEPLOY';
  if ((releasing || req.queue === 'QC_PENDING') && !req.technician?.trim()) {
    throw new ApiError('Say who did the work before the final check or before the bike goes back out', 400, 'technician');
  }
  if ((releasing || req.queue === 'QC_PENDING') && !req.workSummary.trim()) throw new ApiError('Write what you did, or say that no repair was needed, before the final check or before the bike goes back out', 400, 'workSummary');
  if (total > 0 && releasing && !req.liability) {
    throw new ApiError('Pick who pays before the bike goes back out', 400, 'liability');
  }
  if (req.liability && req.liability !== 'COMPANY' && !job.riderId) throw new ApiError('No rider is on this bike, so the company has to cover the cost.', 400, 'liability');
  const rider = riders.find((r) => r.id === job.riderId);
  if (releasing && total > 0 && req.liability !== 'COMPANY' && !rider) {
    throw new ApiError('We could not find the rider for this bike. Fix the rider record before charging anything.', 409);
  }
  if (releasing && req.liability === 'DEPOSIT' && rider && total > rider.depositHeld) {
    throw new ApiError('The cost is more than the deposit we hold. Charge the rider, or let the company cover it.', 400, 'liability');
  }
  if (req.inspection) {
    validateServiceItems(req.inspection.items);
    if (req.inspection.vehicleId !== vehicle.id) throw new ApiError('That check belongs to a different bike', 400);
  }

  const previousQueue = job.queue;
  Object.assign(job, {
    queue: req.queue, damageCategory: req.damageCategory, workSummary: req.workSummary.trim(),
    items: req.items.map((item) => ({ ...item, label: item.label.trim() })), totalCostPaise: total,
    technician: req.technician?.trim() || null, liability: req.liability,
    reference: req.reference?.trim() || null, status: releasing ? 'CLOSED' : 'IN_PROGRESS',
    closedOn: releasing ? iso() : null,
  });
  const target = releasing ? releaseState(vehicle.currentRiderId) : QUEUE_STATE[job.queue];
  if (req.inspection) job.inspections.push({ ...req.inspection, estimatedCostPaise: validateServiceItems(req.inspection.items), nextState: target, items: req.inspection.items.map((item) => ({ ...item })), actor: req.actor, occurredOn: iso() });
  if (vehicle.state !== target || previousQueue !== job.queue) recordVehicleMovement(vehicle, target, req.note, req.actor);
  recordEvent(job, vehicle, req.note, req.actor);
  if (releasing && total > 0 && req.liability && req.liability !== 'COMPANY' && job.riderId) {
    addRiderCharge({ riderId: job.riderId, serviceJobId: job.id, vehicleId: job.vehicleId, amount: total, liability: req.liability });
    if (req.liability === 'DEPOSIT' && rider) rider.depositHeld -= total;
  }
  return job;
}

export function closeServiceJobRecord(req: CloseServiceJobRequest): ServiceJob {
  const job = serviceJobs.find((j) => j.id === req.jobId);
  if (!job) throw new ApiError(`No service job with id ${req.jobId}`, 404);
  return updateServiceJobRecord({
    ...req, queue: 'READY_TO_DEPLOY', damageCategory: job.damageCategory,
    workSummary: job.workSummary || req.items.map((i) => i.label).join('; '),
    reference: job.reference, note: req.note ?? 'Work reviewed and vehicle released', actor: req.actor ?? 'Service desk',
  });
}

export function recordServiceInspection(body: InspectionRequest, actor = 'Service desk'): ServiceJob {
  const vehicle = requireServiceVehicle(body.vehicleId);
  validateCategory(body.category);
  validateServiceItems(body.items);
  if (!hasServiceNote(body.notes) || !body.technician?.trim()) throw new ApiError('Every check needs notes and the name of whoever did it', 400);
  if (!['READY_TO_DEPLOY', 'UNDER_REPAIR', 'QC_PENDING', 'ACCIDENT'].includes(body.nextState)) throw new ApiError('Pick where the bike goes next', 400);
  const queue = queueForDisposition(body.nextState, body.category);
  // Inspection estimates are not the final bill. The work record retains both.
  const job = activeJobForVehicle(vehicle.id) ?? createServiceJob({
    vehicleId: vehicle.id, riderId: vehicle.currentRiderId, source: 'INSPECTION',
    damageCategory: body.category, damageNotes: body.notes, queue: queue === 'READY_TO_DEPLOY' ? 'ASSESSMENT' : queue, actor,
  });
  if (queue === 'READY_TO_DEPLOY' && job.totalCostPaise > 0) throw new ApiError('Check the costs and who pays on the job before the bike goes back out', 409);
  return updateServiceJobRecord({
    jobId: job.id, queue, damageCategory: body.category, workSummary: body.notes, items: job.items,
    technician: body.technician, liability: job.liability, reference: job.reference,
    note: body.notes, actor, inspection: { ...body, estimatedCostPaise: validateServiceItems(body.items) },
  });
}
