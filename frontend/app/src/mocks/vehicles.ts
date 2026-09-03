import type {
  AssignmentHistoryRow,
  BatteryType,
  QcQueueItem,
  Vehicle,
  VehicleLifecycleEvent,
  VehicleState,
} from '../types';
import { HUBS, MODELS, mulberry32, pick } from './seed';

/**
 * Fleet composition is pinned to the dashboard tiles in artboard 02:
 * 137 total = 100 deployed + 22 ready + 9 under repair + 4 QC + 2 accident.
 */
export const FLEET_MIX: Record<VehicleState, number> = {
  DEPLOYED: 100,
  READY_TO_DEPLOY: 22,
  UNDER_REPAIR: 9,
  QC_PENDING: 4,
  ACCIDENT: 2,
  INDUCTED: 0,
  RETURNED: 0,
  RETIRED: 0,
};

/** The twelve rows drawn on artboard 03, verbatim. These lead the list. */
const DESIGNED: ReadonlyArray<
  [id: string, chassis: string, model: string, battery: BatteryType, state: VehicleState, rider: string | null]
> = [
  ['BLRSS0428', 'SESEAG03202300490', 'Eagle-SunM', 'SWAPPABLE', 'DEPLOYED', 'Dulan Hajong'],
  ['FBLSS003B', 'MD9ESLM1225873232', 'Sprinto-SunM', 'SWAPPABLE', 'DEPLOYED', 'Raju Debnath'],
  ['BLRSS0431', 'SESEAG03202300497', 'Eagle-SunM', 'SWAPPABLE', 'READY_TO_DEPLOY', null],
  ['FBLSS0112', 'MD9ESLM1225873418', 'Sprinto-SunM Plus', 'SWAPPABLE', 'DEPLOYED', 'Ashwin Kamath'],
  ['BLRSS0407', 'SESEAG03202300402', 'Eagle-SunM', 'SWAPPABLE', 'UNDER_REPAIR', null],
  ['FBLSS0086', 'MD9ESLM1225873101', 'Sprinto-SunM Pro', 'SWAPPABLE', 'DEPLOYED', 'Nabam Tada'],
  ['BLRSS0419', 'SESEAG03202300455', 'Eagle-SunM', 'SWAPPABLE', 'QC_PENDING', null],
  ['FBLSS0129', 'MD9ESLM1225873560', 'Sprinto-BS', 'FIXED', 'DEPLOYED', 'Imran Shaikh'],
  ['BLRSS0436', 'SESEAG03202300508', 'Eagle-SunM', 'SWAPPABLE', 'READY_TO_DEPLOY', null],
  ['FBLSS0074', 'MD9ESLM1225872944', 'Sprinto-SunM', 'SWAPPABLE', 'ACCIDENT', null],
  ['BLRSS0412', 'SESEAG03202300428', 'Eagle-SunM', 'SWAPPABLE', 'DEPLOYED', 'Lalit Chhetri'],
  ['FBLSS0141', 'MD9ESLM1225873677', 'Sprinto-SunM Plus', 'SWAPPABLE', 'DEPLOYED', 'Sohail Ahmed'],
];

function buildFleet(): Vehicle[] {
  const rng = mulberry32(20260824);
  const out: Vehicle[] = DESIGNED.map(([id, chassisNumber, model, batteryType, state, currentRiderName], i) => ({
    id,
    chassisNumber,
    model,
    batteryType,
    hub: 'Bengaluru',
    state,
    currentRiderId: currentRiderName ? `R${String(3 + i * 4).padStart(2, '0')}` : null,
    currentRiderName,
    inductedOn: `2024-${String(3 + (i % 9)).padStart(2, '0')}-${String(4 + i).padStart(2, '0')}`,
    registrationNumber: null,
    odometerKm: 3200 + Math.floor(rng() * 14000),
  }));

  // Top the fleet up to FLEET_MIX, honouring what the designed rows already used.
  const remaining: Record<VehicleState, number> = { ...FLEET_MIX };
  for (const v of out) remaining[v.state] -= 1;

  let eagle = 437;
  let sprinto = 142;
  for (const state of Object.keys(remaining) as VehicleState[]) {
    for (let n = 0; n < remaining[state]; n += 1) {
      const isEagle = rng() < 0.55;
      const id = isEagle ? `BLRSS0${eagle++}` : `FBLSS0${sprinto++}`;
      const model = isEagle ? 'Eagle-SunM' : pick(rng, MODELS.slice(1));
      out.push({
        id,
        chassisNumber: isEagle
          ? `SESEAG032023${String(500 + Math.floor(rng() * 400)).padStart(5, '0')}`
          : `MD9ESLM12258${String(70000 + Math.floor(rng() * 9000))}`,
        model,
        batteryType: model === 'Sprinto-BS' ? 'FIXED' : 'SWAPPABLE',
        hub: pick(rng, HUBS),
        state,
        currentRiderId: null,
        currentRiderName: null,
        inductedOn: `202${4 + Math.floor(rng() * 2)}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`,
        registrationNumber: null,
        odometerKm: 500 + Math.floor(rng() * 21000),
      });
    }
  }
  return out;
}

export const vehicles: Vehicle[] = buildFleet();

/** The history strip on artboard 04, for BLRSS0428. */
export const lifecycleByVehicle: Record<string, VehicleLifecycleEvent[]> = {
  BLRSS0428: [
    { state: 'INDUCTED', occurredOn: '2024-03-14', note: null, actor: 'Meenakshi Iyer' },
    { state: 'DEPLOYED', occurredOn: '2024-03-22', note: 'Assigned to Dulan Hajong', actor: 'Meenakshi Iyer' },
    { state: 'RETURNED', occurredOn: '2025-11-21', note: 'Rider deboarded', actor: 'Meenakshi Iyer' },
    { state: 'UNDER_REPAIR', occurredOn: '2025-11-23', note: 'Minor — rear brake, panel', actor: 'Dhananjay' },
    { state: 'QC_PENDING', occurredOn: '2025-11-29', note: 'Repair closed', actor: 'Dhananjay' },
    { state: 'READY_TO_DEPLOY', occurredOn: '2025-12-01', note: 'QC passed', actor: 'Abhinandan' },
    { state: 'DEPLOYED', occurredOn: '2026-04-08', note: 'Assigned to Dulan Hajong', actor: 'Meenakshi Iyer' },
  ],
};

/** The dry-run preview on artboard 06, verbatim including its four bad rows. */
export const bulkUploadRows = [
  { rowNumber: 1, id: 'BLRSS0451', chassisNumber: 'SESEAG03202300611', model: 'Eagle-SunM', error: null },
  { rowNumber: 2, id: 'BLRSS0452', chassisNumber: 'SESEAG03202300612', model: 'Eagle-SunM', error: null },
  { rowNumber: 3, id: 'FBLSS0163', chassisNumber: 'MD9ESLM1225874001', model: 'Sprinto-SunM', error: null },
  { rowNumber: 4, id: 'FBLSS0164', chassisNumber: 'MD9ESLM122587400', model: 'Sprinto-SunM', error: 'Chassis must be 17 characters' },
  { rowNumber: 5, id: 'BLRSS0453', chassisNumber: 'SESEAG03202300614', model: 'Eagle-SunM', error: null },
  { rowNumber: 6, id: 'BLRSS0428', chassisNumber: 'SESEAG03202300490', model: 'Eagle-SunM', error: 'Vehicle id already exists' },
  { rowNumber: 7, id: 'FBLSS0165', chassisNumber: 'MD9ESLM1225874003', model: 'Sprinto-SunM Pro', error: null },
  { rowNumber: 8, id: 'FBLSS0166', chassisNumber: 'MD9ESLM1225874004', model: 'Sprinto-XL', error: 'Unknown model' },
  { rowNumber: 9, id: 'BLRSS0454', chassisNumber: 'SESEAG03202300616', model: 'Eagle-SunM', error: null },
  { rowNumber: 10, id: 'BLRSS0455', chassisNumber: '', model: 'Eagle-SunM', error: 'Chassis missing' },
];

/** Device numbers exist only for the bikes drawn on artboard 04. */
export const deviceNumbers: Record<string, { motor: string; controller: string; rfid: string }> = {
  BLRSS0428: { motor: 'MTR-EG-88213', controller: 'CTL-49-201774', rfid: '0004 7712 9930' },
};

/** Assignment history for artboard 04, verbatim. */
export const assignmentsByVehicle: Record<string, AssignmentHistoryRow[]> = {
  BLRSS0428: [
    { riderId: 'R03', riderName: 'Dulan Hajong', planAmount: 175000, startedOn: '2026-04-08', endedOn: null, days: 139, closedBy: null },
    { riderId: 'R11', riderName: 'Sandeep Rathore', planAmount: 170000, startedOn: '2025-12-02', endedOn: '2026-03-27', days: 115, closedBy: 'Meenakshi Iyer' },
    { riderId: 'R07', riderName: 'Faizal Rahman', planAmount: 165000, startedOn: '2025-06-16', endedOn: '2025-11-21', days: 158, closedBy: 'Meenakshi Iyer' },
  ],
};

/**
 * The repair write-ups from artboard 14, verbatim — but keyed by vehicle
 * rather than held as a standalone list.
 *
 * The artboard names four bikes that are not the four the fleet has in
 * QC_PENDING, so a dashboard tile counting the state and a queue listing the
 * artboard's rows would show different bikes to anyone who clicked through.
 * The queue is derived from the fleet in src/lib/api/vehicles.ts and borrows
 * a write-up from here when the id matches.
 */
export const qcRepairDetails: Record<
  string,
  { repairSummary: string; category: QcQueueItem['category']; technician: string; closedOn: string; costPaise: number }
> = {
  BLRSS0419: { repairSummary: 'Brake pads replaced, indicator stalk swapped', category: 'MINOR', technician: 'Dhananjay', closedOn: '2026-08-26', costPaise: 64000 },
  FBLSS0074: { repairSummary: 'Front fork straightened after fall, panel repaint', category: 'MAJOR', technician: 'Abhinandan', closedOn: '2026-08-25', costPaise: 318000 },
  BLRSS0407: { repairSummary: 'Controller replaced under warranty', category: 'WARRANTY', technician: 'Dhananjay', closedOn: '2026-08-24', costPaise: 0 },
  FBLSS0118: { repairSummary: 'Charging port harness rebuilt, battery lock aligned', category: 'MINOR', technician: 'Abhinandan', closedOn: '2026-08-24', costPaise: 92000 },
};

/** Fallback write-ups for bikes the artboard never named. */
export const GENERIC_REPAIRS: ReadonlyArray<{
  repairSummary: string;
  category: QcQueueItem['category'];
  technician: string;
  costPaise: number;
}> = [
  { repairSummary: 'Brake shoes and cable replaced', category: 'MINOR', technician: 'Dhananjay', costPaise: 58000 },
  { repairSummary: 'Rear suspension rebuilt, swingarm bushes pressed', category: 'MAJOR', technician: 'Abhinandan', costPaise: 214000 },
  { repairSummary: 'Battery lock and charging harness replaced under warranty', category: 'WARRANTY', technician: 'Dhananjay', costPaise: 0 },
  { repairSummary: 'Headlamp assembly and indicator stalk swapped', category: 'MINOR', technician: 'Abhinandan', costPaise: 76000 },
];
