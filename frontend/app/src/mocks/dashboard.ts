import type {
  FleetSummary,
  MonthlyDeployments,
  OperationsPeriodSummary,
  ServiceQueueCounts,
} from '../types';
import dayjs from 'dayjs';
import { overdueRiders } from './payments';
import { vehicles } from './vehicles';

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
  overdueRiders: overdueRiders.length,
  overdueValue: overdueRiders.reduce((sum, o) => sum + o.amountDue, 0),
});

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
    acc.source.rsa += d.source.rsa;
    acc.source.walkIn += d.source.walkIn;
    acc.source.qrt += d.source.qrt;
    cur = cur.add(1, 'day');
  }
  return acc;
}

/**
 * Service queues, derived from the fleet where a real state backs the row so
 * the box cannot contradict the vehicles list — the under-repair total is the
 * bikes actually in `UNDER_REPAIR`, split across the prototype's repair kinds;
 * QC pending and the accident kind track their own states. The live-service
 * sources have no state of their own yet and are seeded.
 */
export function serviceQueues(): ServiceQueueCounts {
  const under = vehicles.filter((v) => v.state === 'UNDER_REPAIR').length;
  const qcPending = vehicles.filter((v) => v.state === 'QC_PENDING').length;
  const accident = vehicles.filter((v) => v.state === 'ACCIDENT').length;

  // Partition the under-repair total so the seven rows sum to it.
  const minor = Math.round(under * 0.4);
  const major = Math.round(under * 0.25);
  const warranty = Math.round(under * 0.15);
  const insurance = Math.round(under * 0.1);
  const partsWaiting = Math.max(0, under - minor - major - warranty - insurance);

  return {
    underRepair: { minor, major, accident, warranty, insurance, partsWaiting, qcPending },
    inService: { walkIn: 5, rsa: 3, qrt: 2 },
  };
}
