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
  if (!vehicle) throw new ApiError(`No vehicle with id ${vehicleId}`, 404, 'vehicleId');
  if (vehicle.state === 'RETIRED') throw new ApiError('A scrapped vehicle cannot enter service', 409, 'vehicleId');
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
  if (!['DEBOARD', 'EXCHANGE', 'RSA', 'QRT', 'WALK_IN', 'INSPECTION', 'REGISTRY'].includes(req.source)) throw new ApiError('Choose a valid request source', 400, 'source');
  if (req.riderId !== vehicle.currentRiderId) throw new ApiError('The vehicle assignment changed. Reload before receiving it.', 409, 'riderId');
  if (!req.damageNotes?.trim()) throw new ApiError('Record the reported issue or inspection reason', 400, 'damageNotes');
  if (req.queue && !isServiceQueue(req.queue)) throw new ApiError('Unknown service queue', 400, 'queue');
  if (req.queue === 'READY_TO_DEPLOY') throw new ApiError('Receive the vehicle before recording work and approving release', 400, 'queue');
  if (req.queue && ['WARRANTY', 'INSURANCE', 'PARTS_WAITING'].includes(req.queue) && !req.reference?.trim()) throw new ApiError('Record the claim reference or awaited parts', 400, 'reference');
  if (activeJobForVehicle(vehicle.id)) throw new ApiError('This vehicle already has an open service job. Open that job instead.', 409, 'vehicleId');
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
  if (!(RETURN_DESTINATIONS as readonly string[]).includes(req.nextState)) throw new ApiError('Choose RTD, Under repair, QC or Accident', 400, 'nextVehicleState');
  const existing = activeJobForVehicle(vehicle.id);
  if (existing && existing.totalCostPaise > 0 && req.nextState === 'READY_TO_DEPLOY') {
    throw new ApiError('This bike has unclosed service costs. Send it to QC or close its service job before RTD.', 409, 'nextVehicleState');
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
    throw new ApiError('Each work item needs a description and a non-negative cost in paise', 400, 'items');
  }
  const total = items.reduce((sum, item) => sum + item.costPaise, 0);
  if (!Number.isSafeInteger(total)) throw new ApiError('The total cost is too large', 400, 'items');
  return total;
}

function validateCategory(category: DamageCategory) {
  if (!['NONE', 'MINOR', 'MAJOR', 'ACCIDENT'].includes(category)) throw new ApiError('Choose a valid damage severity', 400, 'damageCategory');
}

export function updateServiceJobRecord(req: UpdateServiceJobRequest): ServiceJob {
  const job = serviceJobs.find((j) => j.id === req.jobId);
  if (!job) throw new ApiError(`No service job with id ${req.jobId}`, 404);
  if (job.status === 'CLOSED') throw new ApiError('This job is already closed', 409);
  if (!isServiceQueue(req.queue)) throw new ApiError('Unknown service queue', 400, 'queue');
  validateCategory(req.damageCategory);
  if (req.liability && !['RIDER', 'DEPOSIT', 'COMPANY'].includes(req.liability)) throw new ApiError('Choose a valid liability', 400, 'liability');
  const vehicle = requireServiceVehicle(job.vehicleId);
  const total = validateServiceItems(req.items);
  if (!hasServiceNote(req.note)) throw new ApiError('Record findings or a reason for this update', 400, 'note');
  if (['WARRANTY', 'INSURANCE', 'PARTS_WAITING'].includes(req.queue) && !req.reference?.trim()) {
    throw new ApiError('Add a claim/reference or the parts being awaited', 400, 'reference');
  }
  const releasing = req.queue === 'READY_TO_DEPLOY';
  if ((releasing || req.queue === 'QC_PENDING') && !req.technician?.trim()) {
    throw new ApiError('Name the technician or inspector before QC or release', 400, 'technician');
  }
  if ((releasing || req.queue === 'QC_PENDING') && !req.workSummary.trim()) throw new ApiError('Record the work done or the no-work inspection result before QC or release', 400, 'workSummary');
  if (total > 0 && releasing && !req.liability) {
    throw new ApiError('Choose who pays before release', 400, 'liability');
  }
  if (req.liability && req.liability !== 'COMPANY' && !job.riderId) throw new ApiError('No rider is linked. Select company liability.', 400, 'liability');
  const rider = riders.find((r) => r.id === job.riderId);
  if (releasing && total > 0 && req.liability !== 'COMPANY' && !rider) {
    throw new ApiError('The linked rider could not be found. Resolve the rider record before charging.', 409);
  }
  if (releasing && req.liability === 'DEPOSIT' && rider && total > rider.depositHeld) {
    throw new ApiError('The cost exceeds the deposit held. Choose rider or company liability.', 400, 'liability');
  }
  if (req.inspection) {
    validateServiceItems(req.inspection.items);
    if (req.inspection.vehicleId !== vehicle.id) throw new ApiError('The inspection must belong to this vehicle', 400);
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
  if (!hasServiceNote(body.notes) || !body.technician?.trim()) throw new ApiError('Record findings and an inspector for every inspection', 400);
  if (!['READY_TO_DEPLOY', 'UNDER_REPAIR', 'QC_PENDING', 'ACCIDENT'].includes(body.nextState)) throw new ApiError('Choose a service outcome', 400);
  const queue = queueForDisposition(body.nextState, body.category);
  // Inspection estimates are not the final bill. The work record retains both.
  const job = activeJobForVehicle(vehicle.id) ?? createServiceJob({
    vehicleId: vehicle.id, riderId: vehicle.currentRiderId, source: 'INSPECTION',
    damageCategory: body.category, damageNotes: body.notes, queue: queue === 'READY_TO_DEPLOY' ? 'ASSESSMENT' : queue, actor,
  });
  if (queue === 'READY_TO_DEPLOY' && job.totalCostPaise > 0) throw new ApiError('Review costs and liability on the service job before release', 409);
  return updateServiceJobRecord({
    jobId: job.id, queue, damageCategory: body.category, workSummary: body.notes, items: job.items,
    technician: body.technician, liability: job.liability, reference: job.reference,
    note: body.notes, actor, inspection: { ...body, estimatedCostPaise: validateServiceItems(body.items) },
  });
}
