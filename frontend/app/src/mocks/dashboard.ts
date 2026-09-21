import type {
  FleetSummary,
  HubUtilisation,
  MonthlyDeployments,
  OperationsPeriodSummary,
  RecoveryCounts,
  ServiceQueueCounts,
  ServiceJob,
} from '../types';
import dayjs from 'dayjs';
import { overdueRiders } from './payments';
import { vehicles } from './vehicles';
import { serviceJobs } from './serviceJobs';

/**
 * Derived, never hardcoded — if a fixture changes, the tiles follow. The
 * wireframe printed an overdue value of 22,551 against sixteen riders; the
 * figure here is the sum of the actual overdue rows for the same reason.
 */
export const fleetSummary = (): FleetSummary => ({
  totalFleet: vehicles.length,
  deployed: vehicles.filter((v) => v.state === 'DEPLOYED').length,
  readyToDeploy: vehicles.filter((v) => v.state === 'READY_TO_DEPLOY').length,
  underRepair: vehicles.filter((v) => v.state === 'UNDER_REPAIR').length,
  qcPending: vehicles.filter((v) => v.state === 'QC_PENDING').length,
  accident: vehicles.filter((v) => v.state === 'ACCIDENT').length,
  recovery: vehicles.filter((v) => v.state === 'RECOVERY').length,
  overdueRiders: overdueRiders.length,
  overdueValue: overdueRiders.reduce((sum, o) => sum + o.amountDue, 0),
});

/**
 * Utilisation per hub, derived from the same fleet the vehicle list renders.
 *
 * Deployed over held. A hub sitting on idle stock is the thing this is meant
 * to surface, which is why idle is carried rather than left to be inferred.
 */
export const hubUtilisation = (): HubUtilisation[] => {
  const byHub = new Map<string, { total: number; deployed: number }>();
  for (const v of vehicles) {
    const row = byHub.get(v.hub) ?? { total: 0, deployed: 0 };
    row.total += 1;
    if (v.state === 'DEPLOYED') row.deployed += 1;
    byHub.set(v.hub, row);
  }
  return [...byHub.entries()]
    .map(([hub, { total, deployed }]) => ({
      hub,
      total,
      deployed,
      idle: total - deployed,
      percent: total === 0 ? 0 : Math.round((deployed / total) * 100),
    }))
    .sort((a, b) => b.percent - a.percent);
};

/** Artboard 02's bar chart: thirteen months to Aug 2026. */
export const monthlyDeployments: MonthlyDeployments[] = [
  ['2025-08', 9], ['2025-09', 12], ['2025-10', 7], ['2025-11', 14], ['2025-12', 18],
  ['2026-01', 11], ['2026-02', 16], ['2026-03', 21], ['2026-04', 13], ['2026-05', 10],
  ['2026-06', 15], ['2026-07', 12], ['2026-08', 6],
].map(([month, count]) => ({ month: month as string, count: count as number }));

/**
 * Today's Operations is a period view, so its numbers must move with the
 * range — a day, a Wed→Tue week and a month cannot return the same totals or
 * nobody will believe the toggle. So the fixture is seeded per day and summed
 * across the requested range: one day's figures, seven days', a month's, all
 * from the same source, always consistent with each other.
 */
function dayHash(iso: string): number {
  let h = 2166136261;
  for (let i = 0; i < iso.length; i++) h = (h ^ iso.charCodeAt(i)) * 16777619;
  return h >>> 0;
}

function daySummary(iso: string): OperationsPeriodSummary {
  const h = dayHash(iso);
  // Independent slices of the hash, each bounded so a single day stays small.
  const pick = (shift: number, mod: number) => (h >>> shift) % mod;
  return {
    movement: {
      deployed: pick(0, 6),
      exchanged: pick(4, 4),
      returned: pick(8, 5),
      recovered: pick(12, 3),
    },
    outcome: {
      readyToDeploy: pick(14, 7),
      underRepair: pick(17, 5),
      qcPending: pick(20, 4),
      accident: pick(23, 2),
    },
    source: {
      rsa: pick(25, 5),
      walkIn: pick(27, 6),
      qrt: pick(29, 3),
    },
  };
}

/** Sum the per-day summaries across the inclusive range. */
export function operationsSummary(startIso: string, endIso: string): OperationsPeriodSummary {
  const end = dayjs(endIso);
  const acc: OperationsPeriodSummary = {
    movement: { deployed: 0, exchanged: 0, returned: 0, recovered: 0 },
    outcome: { readyToDeploy: 0, underRepair: 0, qcPending: 0, accident: 0 },
    source: { rsa: 0, walkIn: 0, qrt: 0 },
  };
  // Guard a reversed or absurd range so the loop always terminates.
  let cur = dayjs(startIso);
  for (let guard = 0; !cur.isAfter(end, 'day') && guard < 400; guard++) {
    const d = daySummary(cur.format('YYYY-MM-DD'));
    acc.movement.deployed += d.movement.deployed;
    acc.movement.exchanged += d.movement.exchanged;
    acc.movement.returned += d.movement.returned;
    acc.movement.recovered += d.movement.recovered;
    acc.outcome.readyToDeploy += d.outcome.readyToDeploy;
    acc.outcome.underRepair += d.outcome.underRepair;
    acc.outcome.qcPending += d.outcome.qcPending;
    acc.outcome.accident += d.outcome.accident;
    cur = cur.add(1, 'day');
  }
  const received = serviceJobs.filter((job) => {
    const date = job.createdOn.slice(0, 10);
    return date >= startIso.slice(0, 10) && date <= endIso.slice(0, 10);
  });
  acc.source.rsa = received.filter((j) => j.source === 'RSA').length;
  acc.source.walkIn = received.filter((j) => j.source === 'WALK_IN').length;
  acc.source.qrt = received.filter((j) => j.source === 'QRT').length;
  return acc;
}

/** Queue and arrival-source counts come from the same open work records. */
export function serviceQueues(): ServiceQueueCounts {
  const open = serviceJobs.filter((j) => j.status !== 'CLOSED');
  const count = (queue: ServiceJob['queue']) => open.filter((j) => j.queue === queue).length;
  return {
    underRepair: {
      assessment: count('ASSESSMENT'), minor: count('MINOR_REPAIR'), major: count('MAJOR_REPAIR'),
      accident: count('ACCIDENT'), warranty: count('WARRANTY'), insurance: count('INSURANCE'),
      partsWaiting: count('PARTS_WAITING'), qcPending: count('QC_PENDING'),
    },
    inService: {
      walkIn: open.filter((j) => j.source === 'WALK_IN').length,
      rsa: open.filter((j) => j.source === 'RSA').length,
      qrt: open.filter((j) => j.source === 'QRT').length,
    },
  };
}

/**
 * Recovery counts, derived so the board agrees with the rest: the two
 * payment-driven rows come out of the overdue riders (worst arrears first),
 * and the physical-location rows come out of the bikes actually in `RECOVERY`
 * and `ACCIDENT`. "Missing" has no state of its own yet — it is carved off the
 * recovery bikes and flagged on the screen rather than invented as a state.
 */
export function recoveryCounts(): RecoveryCounts {
  const inRecovery = vehicles.filter((v) => v.state === 'RECOVERY').length;
  const accident = vehicles.filter((v) => v.state === 'ACCIDENT').length;

  // The deep arrears are the ones with nothing paid; the rest are part-paid.
  const notPaid = overdueRiders.filter((o) => o.stage === 'REPOSSESSION_DUE').length;
  const partiallyPaid = Math.max(0, overdueRiders.length - notPaid);

  // Split the recovery bikes across roadside / missing / already-recovered.
  const leftAtRoadside = Math.round(inRecovery * 0.4);
  const missing = Math.round(inRecovery * 0.2);
  const recovered = Math.max(0, inRecovery - leftAtRoadside - missing);

  return {
    needToRecover: { partiallyPaid, notPaid, leftAtRoadside, missing, accident },
    recovered: { recovered },
  };
}
