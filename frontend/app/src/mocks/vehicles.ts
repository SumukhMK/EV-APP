import type {
  AssignmentHistoryRow,
  BatteryType,
  Iso8601,
  QcQueueItem,
  Rider,
  Vehicle,
  VehicleLifecycleEvent,
  VehicleState,
} from '../types';
import { FIRST_NAMES, LAST_NAMES, MODELS, STAFF, mulberry32, pick } from './seed';

/**
 * Fleet composition is pinned to the dashboard tiles in artboard 02:
 * 137 total = 97 active + 22 ready to deploy + 9 in service + 4 quality check + 2 accident + 3 recovery.
 */
export const FLEET_MIX: Record<VehicleState, number> = {
  DEPLOYED: 97,
  READY_TO_DEPLOY: 22,
  UNDER_REPAIR: 9,
  QC_PENDING: 4,
  ACCIDENT: 2,
  INDUCTED: 0,
  RETURNED: 0,
  RECOVERY: 3,
  RETIRED: 0,
};

/**
 * The twelve rows drawn on artboard 03, verbatim. These lead the list.
 *
 * Rider stays tagged until receipt is generated at QC release, so service-state
 * vehicles (UNDER_REPAIR, QC_PENDING, ACCIDENT) keep their rider. Only
 * RTD (no rider) and the designed RTD bikes have null.
 */
const DESIGNED: ReadonlyArray<
  [id: string, chassis: string, model: string, battery: BatteryType, state: VehicleState, rider: string | null, vendor: string | null]
> = [
  ['BLRSS0428', 'SESEAG03202300490', 'Eagle-SunM', 'Sun Mobility', 'DEPLOYED', 'Dulan Hajong', 'Sun Mobility'],
  ['FBLSS003B', 'MD9ESLM1225873232', 'Sprinto-SunM', 'Sun Mobility', 'DEPLOYED', 'Raju Debnath', 'Sun Mobility'],
  ['BLRSS0431', 'SESEAG03202300497', 'Eagle-SunM', 'Sun Mobility', 'READY_TO_DEPLOY', null, 'Sun Mobility'],
  ['FBLSS0112', 'MD9ESLM1225873418', 'Sprinto-SunM Plus', 'Sun Mobility', 'DEPLOYED', 'Ashwin Kamath', 'Sun Mobility'],
  ['BLRSS0407', 'SESEAG03202300402', 'Eagle-SunM', 'Sun Mobility', 'UNDER_REPAIR', 'Arjun Mehta', 'Sun Mobility'],
  ['FBLSS0086', 'MD9ESLM1225873101', 'Sprinto-SunM Pro', 'Sun Mobility', 'DEPLOYED', 'Nabam Tada', 'Sun Mobility'],
  ['BLRSS0419', 'SESEAG03202300455', 'Eagle-SunM', 'Sun Mobility', 'QC_PENDING', 'Vikram Patil', 'Sun Mobility'],
  ['FBLSS0129', 'MD9ESLM1225873560', 'Sprinto-BS', 'Battery Smart', 'DEPLOYED', 'Imran Shaikh', 'Battery Smart'],
  ['BLRSS0436', 'SESEAG03202300508', 'Eagle-SunM', 'Sun Mobility', 'READY_TO_DEPLOY', null, 'Sun Mobility'],
  ['FBLSS0074', 'MD9ESLM1225872944', 'Sprinto-SunM', 'Sun Mobility', 'ACCIDENT', 'Nitin Desai', 'Sun Mobility'],
  ['BLRSS0412', 'SESEAG03202300428', 'Eagle-SunM', 'Sun Mobility', 'DEPLOYED', 'Lalit Chhetri', 'Sun Mobility'],
  ['FBLSS0141', 'MD9ESLM1225873677', 'Sprinto-SunM Plus', 'Sun Mobility', 'DEPLOYED', 'Sohail Ahmed', 'Sun Mobility'],
];

/**
 * Where a bike sits depends on what it is doing.
 *
 * Spreading hubs uniformly gave every hub the fleet-wide utilisation rate —
 * four identical middling bars, which is both unrealistic and useless as a
 * fixture: the idle-stock problem the utilisation panel exists to surface
 * never appeared. Deployed bikes now concentrate where the demand is and idle
 * stock piles up where it doesn't, so the hubs land across the whole scale.
 */
const HUB_WEIGHTS: Record<'deployed' | 'idle', ReadonlyArray<readonly [string, number]>> = {
  deployed: [
    ['Whitefield', 0.585],
    ['HSR Layout', 0.292],
    ['Koramangala', 0.103],
    ['Bengaluru', 0.020],
  ],
  idle: [
    ['Whitefield', 0.146],
    ['HSR Layout', 0.293],
    ['Koramangala', 0.241],
    ['Bengaluru', 0.320],
  ],
};

function weightedHub(rng: () => number, state: VehicleState): string {
  const table = HUB_WEIGHTS[state === 'DEPLOYED' ? 'deployed' : 'idle'];
  let roll = rng();
  for (const [hub, weight] of table) {
    roll -= weight;
    if (roll <= 0) return hub;
  }
  return table[table.length - 1][0];
}

/**
 * Service-state vehicles that came from a rider keep their rider tagged until
 * receipt is generated at QC release. Only wear-and-tear jobs from RTD have
 * no rider. The first generated vehicle per service state is the RTD case;
 * every other one keeps a rider name so the rider builder can pair them.
 */
const SERVICE_STATES: VehicleState[] = ['UNDER_REPAIR', 'QC_PENDING', 'ACCIDENT', 'RECOVERY'];

function buildFleet(): Vehicle[] {
  const rng = mulberry32(20260824);
  const out: Vehicle[] = DESIGNED.map(([id, chassisNumber, model, batteryType, state, currentRiderName, batteryVendor], i) => ({
    id,
    chassisNumber,
    model,
    batteryType,
    batteryVendor,
    hub: weightedHub(rng, state),
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

  // Track how many generated per service state — first one is RTD wear & tear (no rider).
  const serviceGenCount: Record<string, number> = {};

  let eagle = 437;
  let sprinto = 142;
  for (const state of Object.keys(remaining) as VehicleState[]) {
    for (let n = 0; n < remaining[state]; n += 1) {
      const isEagle = rng() < 0.55;
      const seq = isEagle ? eagle++ : sprinto++;
      const model = isEagle ? 'Eagle-SunM' : pick(rng, MODELS.slice(1));

      // Service-state vehicles: first generated one per state has no rider (RTD
      // wear & tear / company-pays). All others keep their rider tagged.
      const isService = SERVICE_STATES.includes(state);
      const genIdx = serviceGenCount[state] ?? 0;
      serviceGenCount[state] = genIdx + 1;
      // Service vehicles with riders get names here (rider builder pairs them).
      // DEPLOYED vehicles get names from the rider builder, not here.
      const riderName = isService && genIdx > 0
        ? `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`
        : null;

      out.push({
        id: isEagle ? `BLRSS0${seq}` : `FBLSS0${seq}`,
        chassisNumber: isEagle
          ? `SESEAG032023${String(600 + seq - 437).padStart(5, '0')}`
          : `MD9ESLM12258${74000 + seq - 142}`,
        model,
        batteryType: model === 'Sprinto-BS' ? 'Battery Smart' : 'Sun Mobility',
        batteryVendor: model === 'Sprinto-BS' ? 'Battery Smart' : 'Sun Mobility',
        hub: weightedHub(rng, state),
        state,
        currentRiderId: null,      // filled by the rider builder
        currentRiderName: riderName,
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
export const deviceNumbers: Record<string, { motor: string; controller: string; rfid: string; iot: string | null }> = {
  BLRSS0428: { motor: 'MTR-EG-88213', controller: 'CTL-49-201774', rfid: '0004 7712 9930', iot: 'IOT-428-001' },
};

/**
 * Assignment history for artboard 04, verbatim.
 *
 * The two closed rows name riders who have left the register, so their ids
 * (R900/R901) deliberately collide with nobody on it — the register's ids run
 * R02 to the mid-R100s. The names, dates and plans are the artboard's own.
 */
export const assignmentsByVehicle: Record<string, AssignmentHistoryRow[]> = {
  BLRSS0428: [
    { riderId: 'R03', riderName: 'Dulan Hajong', planAmount: 175000, startedOn: '2026-04-08', endedOn: null, days: 139, closedBy: null },
    { riderId: 'R900', riderName: 'Sandeep Rathore', planAmount: 170000, startedOn: '2025-12-02', endedOn: '2026-03-27', days: 115, closedBy: 'Meenakshi Iyer' },
    { riderId: 'R901', riderName: 'Faizal Rahman', planAmount: 165000, startedOn: '2025-06-16', endedOn: '2025-11-21', days: 158, closedBy: 'Meenakshi Iyer' },
  ],
};

/** Days between two ISO dates, rounded — the count the rider panel prints. */
function daysBetween(from: Iso8601, to: Iso8601) {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}

/** An ISO date shifted by whole days. UTC throughout, like daysBetween. */
function addDays(iso: Iso8601, days: number): Iso8601 {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Opens a row the moment a bike goes out.
 *
 * <p>The three assignment events used to move only the flags on the rider and
 * the bike, so nothing ever reached this table and the rider profile's "Bike
 * history" panel — which reads nothing else — stayed empty for everyone
 * assigned during a session. Only artboard 04's bike has fixture rows, so a
 * deboarded rider read "This rider has never held a bike" no matter what had
 * just happened to them.
 */
export function recordAssignmentStart(vehicleId: string, rider: Rider, startedOn: Iso8601) {
  const rows = (assignmentsByVehicle[vehicleId] ??= []);
  // One open row per rider, the way the partial unique index enforces it.
  if (rows.some((a) => a.riderId === rider.id && a.endedOn === null)) return;
  rows.unshift({
    riderId: rider.id,
    riderName: rider.name,
    planAmount: rider.planAmount,
    startedOn,
    endedOn: null,
    days: daysBetween(startedOn, new Date().toISOString().slice(0, 10)),
    closedBy: null,
  });
}

/**
 * Closes the open row. The row is never deleted — the panel exists to show the
 * bikes that have gone back, and a deboarded rider's past is the reason it is
 * worth looking at.
 *
 * The mock has no actor identity to sign with, so it signs "Fleet desk" exactly
 * as the service-job mock does.
 */
export function recordAssignmentClose(
  vehicleId: string,
  riderId: string,
  endedOn: Iso8601,
  reason: string | null,
  returnCondition: string | null,
) {
  const row = (assignmentsByVehicle[vehicleId] ?? []).find((a) => a.riderId === riderId && a.endedOn === null);
  if (!row) return;
  row.endedOn = endedOn;
  row.days = daysBetween(row.startedOn, endedOn);
  row.reason = reason;
  row.returnCondition = returnCondition;
  row.closedBy = 'Fleet desk';
}

/** Why a past bike came back — a mix of the exchange and deboard enums. */
const PAST_REASONS = [
  'BREAKDOWN', 'BATTERY_ISSUE', 'SERVICE_REQUIRED', 'RIDER_REQUEST', 'UPGRADE',
  'WENT_HOME', 'PAYMENT_ISSUE', 'RETURNED', 'OTHER',
] as const;

/** Weighted toward a clean return, the way the counter actually sees them. */
const PAST_CONDITIONS = ['NONE', 'NONE', 'NONE', 'MINOR', 'MAJOR'] as const;

/**
 * Seeds assignment history for the whole fleet, so the rider profile's "Bike
 * history" panel has something to draw for everyone — not just artboard 04's
 * bike. Three passes, each coherent on its own:
 *
 *  1. Every rider holding a bike gets an open row on it, dated from their
 *     onboarding. The current bike is the first row of its own history.
 *  2. The deboarded riders get a closed row on an idle bike — their history
 *     is the whole point of the panel.
 *  3. A deterministic subset of riders holding a bike get one past bike from
 *     the idle pool, so a timeline shows more than a single entry. Windows
 *     never overlap on a bike, and a rider's past bike always ends before
 *     their current one starts.
 *
 * Called from mocks/riders.ts once the register exists — the rows need the
 * rider's plan and onboarding date, which the vehicle fixture does not carry.
 */
export function seedAssignmentHistory(riders: Rider[]) {
  const rng = mulberry32(20261006);
  const today = new Date().toISOString().slice(0, 10);
  const idleBikes = vehicles.filter((v) => v.state === 'READY_TO_DEPLOY' && !v.currentRiderId);
  const usedRiders = new Set<string>();

  // 1. The open row every holder gets.
  for (const r of riders) {
    if (!r.currentVehicleId) continue;
    const rows = (assignmentsByVehicle[r.currentVehicleId] ??= []);
    // One open row per rider — the partial unique index's rule. Artboard 04's
    // rows already cover R03, so they are left alone.
    if (rows.some((a) => a.riderId === r.id && a.endedOn === null)) continue;
    rows.unshift({
      riderId: r.id,
      riderName: r.name,
      planAmount: r.planAmount,
      startedOn: r.onboardedOn,
      endedOn: null,
      days: daysBetween(r.onboardedOn, today),
      closedBy: null,
    });
  }

  // 2. Deboarded riders: a closed row on an idle bike, ending after they
  //    joined and before today.
  const deboarded = riders.filter((r) => r.status === 'INACTIVE');
  for (let i = 0; i < deboarded.length; i += 1) {
    const r = deboarded[i];
    const start = addDays(r.onboardedOn, 3 + Math.floor(rng() * 20));
    const end = addDays(start, 30 + Math.floor(rng() * 150));
    if (end >= today) continue; // joined too recently to have a past bike
    (assignmentsByVehicle[idleBikes[i % idleBikes.length].id] ??= []).push({
      riderId: r.id,
      riderName: r.name,
      planAmount: r.planAmount,
      startedOn: start,
      endedOn: end,
      days: daysBetween(start, end),
      reason: pick(rng, PAST_REASONS),
      returnCondition: pick(rng, PAST_CONDITIONS),
      closedBy: pick(rng, STAFF),
    });
    usedRiders.add(r.id);
  }

  // 3. Past bikes for a subset of holders, on the idle bikes the deboarded
  //    riders did not take. Newest window first keeps the rows newest-first.
  const holders = riders.filter((r) => r.currentVehicleId);
  for (const bike of idleBikes) {
    if (assignmentsByVehicle[bike.id]?.length) continue; // taken by a deboarded rider
    const roll = rng();
    const count = roll < 0.3 ? 0 : roll < 0.85 ? 1 : 2;
    let cursor = today;
    for (let i = 0; i < count; i += 1) {
      const end = addDays(cursor, -(20 + Math.floor(rng() * 200)));
      const start = addDays(end, -(30 + Math.floor(rng() * 150)));
      // The rider's current bike started at onboarding, so a past bike must
      // have ended before it.
      const rider = holders.find((h) => !usedRiders.has(h.id) && h.onboardedOn > end);
      if (!rider) break;
      usedRiders.add(rider.id);
      (assignmentsByVehicle[bike.id] ??= []).push({
        riderId: rider.id,
        riderName: rider.name,
        planAmount: rider.planAmount,
        startedOn: start,
        endedOn: end,
        days: daysBetween(start, end),
        reason: pick(rng, PAST_REASONS),
        returnCondition: pick(rng, PAST_CONDITIONS),
        closedBy: pick(rng, STAFF),
      });
      cursor = start;
    }
  }
}

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
