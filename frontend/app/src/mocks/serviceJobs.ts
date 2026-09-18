import type {
  CloseServiceJobRequest, CreateServiceJobRequest, DamageCategory, InspectionRequest, ServiceJob,
  ServiceJobItem, ServiceJobSource, ServiceQueue, UpdateServiceJobRequest, Vehicle, VehicleState,
} from '../types';
import { ApiError } from '../lib/api/client';
import { hasServiceNote, isServiceQueue, QUEUE_STATE, RETURN_DESTINATIONS, queueForCondition, queueForDisposition, releaseState } from '../lib/serviceWorkflow';
import { addRiderCharge } from './riderCharges';
import { riders } from './riders';
import { lifecycleByVehicle, vehicles } from './vehicles';

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

/**
 * Fixture jobs. Every bike sitting in a service state gets exactly one open
 * job, and the spread is deliberate: each service list, each way a bike can
 * arrive, each damage level, each status and each way a job can be paid for
 * has at least one record. A demo that only ever shows "Needs checking" hides
 * most of the screen, so the fixture walks the whole workbench instead.
 *
 * Bikes whose damage was never written down keep source REGISTRY and land in
 * Needs checking — the app must still ask an operator what is wrong rather
 * than invent a severity.
 */
interface SeedWork {
  summary: string;
  technician: string;
  items: ServiceJobItem[];
  note: string;
}
interface SeedPlan {
  queue: ServiceQueue;
  source: ServiceJobSource;
  category: DamageCategory;
  notes: string;
  daysAgo: number;
  reference?: string;
  location?: string;
  work?: SeedWork;
}

const REPAIR_PLANS: SeedPlan[] = [
  // Index 0 → designed UNDER_REPAIR vehicle (has rider "Arjun Mehta"). Rider-caused.
  { queue: 'MINOR_REPAIR', source: 'DEBOARD', category: 'MINOR', daysAgo: 12,
    notes: 'Rider handed it back with a cracked mirror and a loose indicator stalk.',
    work: { summary: 'Mirror glass replaced. Indicator stalk refitted and tested.', technician: 'Dhananjay', note: 'Mirror done, road test pending.',
      items: [{ label: 'Mirror glass', costPaise: 42000, kind: 'PART' }, { label: 'Fitting', costPaise: 20000, kind: 'LABOUR' }] } },
  // Index 1 → first generated UNDER_REPAIR (no rider — RTD wear & tear, company pays).
  // REGISTRY/ASSESSMENT with no work: test verifies "unchecked" UI path via needsDamageAssessment().
  { queue: 'ASSESSMENT', source: 'REGISTRY', category: 'NONE', daysAgo: 19,
    notes: 'Migrated record. Wear and tear found during RTD check — no rider to charge.' },
  // Index 2+ → generated vehicles with riders.
  { queue: 'ASSESSMENT', source: 'REGISTRY', category: 'NONE', daysAgo: 16,
    notes: 'Migrated record. Came off the road with no notes.',
    work: { summary: 'Visual check done. Minor scuffs on panels, brakes at 60%.', technician: 'Dhananjay', note: 'Assessed — minor scuffs, no structural issue.',
      items: [{ label: 'Panel touch-up', costPaise: 15000, kind: 'LABOUR' }] } },
  { queue: 'MINOR_REPAIR', source: 'WALK_IN', category: 'MINOR', daysAgo: 4,
    notes: 'Rider came to the hub: brakes feel soft, rear pads worn thin.', location: 'Whitefield hub',
    work: { summary: 'Rear brake pads replaced. Front pads at 40%, noted for next visit.', technician: 'Abhinandan', note: 'Rear pads swapped, front still OK.',
      items: [{ label: 'Rear brake pads', costPaise: 32000, kind: 'PART' }, { label: 'Fitting and adjustment', costPaise: 18000, kind: 'LABOUR' }] } },
  { queue: 'MAJOR_REPAIR', source: 'RSA', category: 'MAJOR', daysAgo: 9,
    notes: 'Picked up from the roadside. Motor cut out and would not restart.', location: 'Outer Ring Road, Marathahalli',
    work: { summary: 'Controller tested and replaced. Wiring loom checked end to end.', technician: 'Abhinandan', note: 'Controller swapped, now on test.',
      items: [{ label: 'Motor controller', costPaise: 184000, kind: 'PART' }, { label: 'Diagnosis and fitting', costPaise: 60000, kind: 'LABOUR' }] } },
  { queue: 'MAJOR_REPAIR', source: 'EXCHANGE', category: 'MAJOR', daysAgo: 6,
    notes: 'Swapped out for a spare bike. Rear suspension knocking and swingarm play.',
    work: { summary: 'Swingarm bearing replaced. Rear shock inspected — serviceable but monitor.', technician: 'Dhananjay', note: 'Swingarm fixed, shock to watch.',
      items: [{ label: 'Swingarm bearing set', costPaise: 72000, kind: 'PART' }, { label: 'Labour', costPaise: 45000, kind: 'LABOUR' }] } },
  { queue: 'WARRANTY', source: 'INSPECTION', category: 'MINOR', daysAgo: 8, reference: 'WR-2026-0431 · e-Sprinto, reply expected 22 Sep',
    notes: 'Routine check found the battery lock failing. Still inside warranty, so the maker pays.',
    work: { summary: 'Battery lock assembly sent back to the maker under warranty. Bike held until the replacement lands.', technician: 'Dhananjay', note: 'Claim raised with the maker.', items: [] } },
  { queue: 'INSURANCE', source: 'QRT', category: 'ACCIDENT', daysAgo: 14, reference: 'CLM-88214 · surveyor visited 6 Sep',
    notes: 'Rescue team brought it in after a side-on hit at a junction. Insurance is handling it.', location: 'Sarjapur Road junction',
    work: { summary: 'Photographed for the surveyor. Front panel, forks and headlamp all need replacing.', technician: 'Abhinandan', note: 'Waiting on the insurance decision.',
      items: [{ label: 'Front panel set', costPaise: 268000, kind: 'PART' }, { label: 'Fork assembly', costPaise: 195000, kind: 'PART' }] } },
  { queue: 'PARTS_WAITING', source: 'DEBOARD', category: 'MAJOR', daysAgo: 11, reference: 'Charging harness — expected 22 Sep',
    notes: 'Rider gave it back because it would not charge. Harness is burnt.',
    work: { summary: 'Charging harness burnt at the connector. New harness on order.', technician: 'Dhananjay', note: 'Part ordered, nothing more to do until it arrives.',
      items: [{ label: 'Charging harness', costPaise: 88000, kind: 'PART' }] } },
];

const QC_PLANS: SeedPlan[] = [
  // Index 0 → designed QC vehicle (BLRSS0419, rider "Vikram Patil"). Rider-caused.
  { queue: 'QC_PENDING', source: 'DEBOARD', category: 'NONE', daysAgo: 3,
    notes: 'Rider gave it back in good shape. No repair needed, just QC.',
    work: { summary: 'Nothing to repair. Brakes, lights, horn and battery lock all checked.', technician: 'Dhananjay', note: 'Sent for QC with no work needed.', items: [] } },
  // Index 1 → first generated QC (no rider — RTD wear & tear).
  { queue: 'QC_PENDING', source: 'INSPECTION', category: 'NONE', daysAgo: 2,
    notes: 'Routine check before going back out. Company-owned maintenance.',
    work: { summary: 'Full check done. Brake pads at half life, everything else fine.', technician: 'Dhananjay', note: 'Nothing to fix. Sent for QC.', items: [] } },
  // Index 2+ → generated vehicles with riders.
  { queue: 'QC_PENDING', source: 'RSA', category: 'MINOR', daysAgo: 5,
    notes: 'Flat rear tyre on the road. Roadside team brought it in.', location: 'HSR Layout, 27th Main',
    work: { summary: 'Rear tube and tyre replaced, wheel balanced.', technician: 'Abhinandan', note: 'Repair done, sent for QC.',
      items: [{ label: 'Rear tyre', costPaise: 138000, kind: 'PART' }, { label: 'Tube and fitting', costPaise: 42000, kind: 'LABOUR' }] } },
  { queue: 'QC_PENDING', source: 'REGISTRY', category: 'MINOR', daysAgo: 23,
    notes: 'Migrated record. Repair finished, receipt generated, rider decoupled. Waiting on QC.',
    work: { summary: 'Chain and sprocket replaced. Brakes bled.', technician: 'Abhinandan', note: 'Repair done, QC next.',
      items: [{ label: 'Chain and sprocket set', costPaise: 85000, kind: 'PART' }, { label: 'Labour', costPaise: 30000, kind: 'LABOUR' }] } },
];

const ACCIDENT_PLANS: SeedPlan[] = [
  // Index 0 → designed ACCIDENT vehicle (FBLSS0074, rider "Nitin Desai"). Rider-caused.
  { queue: 'ACCIDENT', source: 'QRT', category: 'ACCIDENT', daysAgo: 7,
    notes: 'Rescue team brought it in after a fall. Rider unhurt. Front end badly bent.', location: 'Whitefield main road',
    work: { summary: 'Front fender crumpled, headlamp shattered, handlebar bent. Awaiting parts quote.', technician: 'Abhinandan', note: 'Damage documented, waiting on quote.',
      items: [{ label: 'Front fender', costPaise: 145000, kind: 'PART' }, { label: 'Headlamp assembly', costPaise: 96000, kind: 'PART' }, { label: 'Handlebar', costPaise: 68000, kind: 'PART' }] } },
  // Index 1 → generated ACCIDENT (no rider — hit while parked at hub, company absorbs).
  { queue: 'ACCIDENT', source: 'DEBOARD', category: 'ACCIDENT', daysAgo: 21,
    notes: 'Found damaged at the hub. Frame looks bent — possibly hit while parked.',
    work: { summary: 'Frame alignment checked — bent beyond an economical repair. Sent up for a scrap decision.', technician: 'Abhinandan', note: 'Waiting on a call about scrapping it.',
      items: [{ label: 'Frame inspection', costPaise: 35000, kind: 'LABOUR' }] } },
];

/** Jobs that already finished, so closed records and charges are explorable. */
interface ClosedPlan {
  state: VehicleState;
  source: ServiceJobSource;
  category: DamageCategory;
  liability: ServiceJob['liability'];
  notes: string;
  summary: string;
  technician: string;
  items: ServiceJobItem[];
  daysAgo: number;
  /** Bills to an earlier week, so the run shows money carried forward. */
  earlierPeriod?: boolean;
}

const CLOSED_PLANS: ClosedPlan[] = [
  { state: 'DEPLOYED', source: 'WALK_IN', category: 'MINOR', liability: 'RIDER', daysAgo: 5,
    notes: 'Rider came to the hub with a broken brake lever after dropping the bike.',
    summary: 'Brake lever and cable replaced. Road tested and handed back to the same rider.', technician: 'Dhananjay',
    items: [{ label: 'Brake lever', costPaise: 38000, kind: 'PART' }, { label: 'Cable and fitting', costPaise: 26000, kind: 'LABOUR' }] },
  { state: 'DEPLOYED', source: 'RSA', category: 'MAJOR', liability: 'DEPOSIT', daysAgo: 9,
    notes: 'Kerb hit on the roadside. Roadside team recovered it.',
    summary: 'Front fork straightened, headlamp replaced, wheel realigned. Taken out of the deposit we hold.', technician: 'Abhinandan',
    items: [{ label: 'Headlamp assembly', costPaise: 96000, kind: 'PART' }, { label: 'Fork straightening', costPaise: 84000, kind: 'LABOUR' }] },
  { state: 'DEPLOYED', source: 'QRT', category: 'MINOR', liability: 'RIDER', daysAgo: 17, earlierPeriod: true,
    notes: 'Rescue team swapped a dead battery lock at the roadside.',
    summary: 'Battery lock replaced on the spot. Charged to the rider, still unpaid.', technician: 'Dhananjay',
    items: [{ label: 'Battery lock', costPaise: 52000, kind: 'PART' }] },
  { state: 'DEPLOYED', source: 'EXCHANGE', category: 'NONE', liability: 'COMPANY', daysAgo: 13,
    notes: 'Bike swapped because the rider changed to a longer shift. No damage.',
    summary: 'Checked over, cleaned and sent back out. Nothing charged to the rider.', technician: 'Dhananjay', items: [] },
  { state: 'READY_TO_DEPLOY', source: 'INSPECTION', category: 'NONE', liability: 'COMPANY', daysAgo: 2,
    notes: 'Routine check before the bike goes to a new rider.',
    summary: 'Full check passed. No work needed.', technician: 'Abhinandan', items: [] },
];

const DAY_MS = 86_400_000;
const seedDate = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY_MS).toISOString();

function seedJob(vehicle: Vehicle, plan: SeedPlan): ServiceJob {
  const createdOn = seedDate(plan.daysAgo);
  const job = makeJob({
    vehicleId: vehicle.id, riderId: vehicle.currentRiderId, source: plan.source,
    damageCategory: plan.category, queue: plan.queue, damageNotes: plan.notes,
    location: plan.location ?? vehicle.hub, reference: plan.reference, occurredOn: createdOn,
  });
  job.activity.push({ occurredOn: createdOn, actor: 'Fleet desk', note: plan.notes, queue: plan.queue, vehicleState: vehicle.state });
  if (plan.work) {
    const workedOn = seedDate(Math.max(0, plan.daysAgo - 1));
    job.workSummary = plan.work.summary;
    job.technician = plan.work.technician;
    job.items = plan.work.items.map((item) => ({ ...item }));
    job.totalCostPaise = job.items.reduce((sum, item) => sum + item.costPaise, 0);
    job.status = 'IN_PROGRESS';
    job.updatedOn = workedOn;
    job.activity.push({ occurredOn: workedOn, actor: plan.work.technician, note: plan.work.note, queue: plan.queue, vehicleState: vehicle.state });
    job.inspections.push({
      vehicleId: vehicle.id, category: plan.category, notes: plan.work.summary,
      items: job.items.map((item) => ({ ...item })), technician: plan.work.technician,
      estimatedCostPaise: job.totalCostPaise, nextState: vehicle.state,
      occurredOn: workedOn, actor: plan.work.technician,
    });
  }
  return job;
}

function seedClosedJob(vehicle: Vehicle, plan: ClosedPlan): ServiceJob {
  const createdOn = seedDate(plan.daysAgo);
  const closedOn = seedDate(Math.max(0, plan.daysAgo - 1));
  const job = makeJob({
    vehicleId: vehicle.id, riderId: vehicle.currentRiderId, source: plan.source,
    damageCategory: plan.category, queue: 'MINOR_REPAIR', damageNotes: plan.notes,
    location: vehicle.hub, occurredOn: createdOn,
  });
  const items = plan.items.map((item) => ({ ...item }));
  const total = items.reduce((sum, item) => sum + item.costPaise, 0);
  Object.assign(job, {
    queue: 'READY_TO_DEPLOY' as ServiceQueue, status: 'CLOSED' as const, closedOn, updatedOn: closedOn,
    workSummary: plan.summary, technician: plan.technician, items, totalCostPaise: total,
    liability: total > 0 ? plan.liability : 'COMPANY',
  });
  job.activity.push(
    { occurredOn: createdOn, actor: 'Fleet desk', note: plan.notes, queue: 'MINOR_REPAIR', vehicleState: 'UNDER_REPAIR' },
    { occurredOn: closedOn, actor: plan.technician, note: plan.summary, queue: 'READY_TO_DEPLOY', vehicleState: vehicle.state },
  );
  job.inspections.push({
    vehicleId: vehicle.id, category: plan.category, notes: plan.summary, items: items.map((item) => ({ ...item })),
    technician: plan.technician, estimatedCostPaise: total, nextState: vehicle.state,
    occurredOn: closedOn, actor: plan.technician,
  });
  if (total > 0 && job.riderId && job.liability && job.liability !== 'COMPANY') {
    addRiderCharge({
      riderId: job.riderId, serviceJobId: job.id, vehicleId: job.vehicleId,
      amount: total, liability: job.liability, period: plan.earlierPeriod ? 'PREVIOUS' : 'CURRENT',
    });
    const rider = riders.find((r) => r.id === job.riderId);
    if (job.liability === 'DEPOSIT' && rider) rider.depositHeld = Math.max(0, rider.depositHeld - total);
  }
  return job;
}

function buildSeedJobs(): ServiceJob[] {
  const byState = (state: VehicleState) => vehicles.filter((v) => v.state === state);
  const jobs: ServiceJob[] = [];
  const plans: Array<[VehicleState, SeedPlan[]]> = [
    ['UNDER_REPAIR', REPAIR_PLANS], ['QC_PENDING', QC_PLANS], ['ACCIDENT', ACCIDENT_PLANS],
  ];
  for (const [state, list] of plans) {
    const pool = byState(state);
    // More bikes than written plans is normal — the extras repeat the plans so
    // every bike in a service state still has exactly one job to open.
    pool.forEach((vehicle, index) => jobs.push(seedJob(vehicle, list[index % list.length])));
  }
  const used = new Set(jobs.map((j) => j.vehicleId));
  for (const plan of CLOSED_PLANS) {
    const vehicle = byState(plan.state).find((v) => !used.has(v.id) && (plan.liability === 'COMPANY' || v.currentRiderId));
    if (!vehicle) continue;
    used.add(vehicle.id);
    jobs.push(seedClosedJob(vehicle, plan));
  }
  return jobs.sort((a, b) => b.createdOn.localeCompare(a.createdOn));
}

export const serviceJobs: ServiceJob[] = buildSeedJobs();

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
  if (!(RETURN_DESTINATIONS as readonly string[]).includes(req.nextState)) throw new ApiError('Pick one: Quality Check, In Service, or Accident', 400, 'nextVehicleState');
  const existing = activeJobForVehicle(vehicle.id);
  if (existing && existing.totalCostPaise > 0 && req.nextState === 'READY_TO_DEPLOY') {
    throw new ApiError('This bike still has an open service job with costs on it. Finish that job before marking the bike Ready to Deploy.', 409, 'nextVehicleState');
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
    throw new ApiError('Say who did the work before QC or before the bike goes back out', 400, 'technician');
  }
  if ((releasing || req.queue === 'QC_PENDING') && !req.workSummary.trim()) throw new ApiError('Write what you did, or say that no repair was needed, before QC or before the bike goes back out', 400, 'workSummary');
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
  // Receipt generated → decouple rider from vehicle. ServiceJob.riderId stays for payment audit.
  if (releasing && vehicle.currentRiderId) {
    vehicle.currentRiderId = null;
    vehicle.currentRiderName = null;
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
