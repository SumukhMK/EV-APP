import type { BillingDay, Rider } from '../types';
import { FIRST_NAMES, LAST_NAMES, STAFF, mulberry32, pick } from './seed';
import { vehicles } from './vehicles';

/**
 * One rider per deployed bike — the registry's one-to-one rule. Building the
 * riders from the fleet (rather than side by side) is what keeps the two
 * fixtures from drifting: there is exactly one place a pairing is decided.
 *
 * The Monday/Wednesday split is 58/42, matching the "58 riders billed" line in
 * the audit log for the Monday run.
 */

const DESIGNED: ReadonlyArray<
  [id: string, name: string, phone: string, vehicleId: string, planRupees: number, day: BillingDay, pay: Rider['paymentStatus']]
> = [
  ['R03', 'Dulan Hajong', '8453679575', 'BLRSS0428', 1750, 'MONDAY', 'PAID'],
  ['R19', 'Raju Debnath', '9862340117', 'FBLSS003B', 1999, 'WEDNESDAY', 'PARTIAL'],
  ['R07', 'Ashwin Kamath', '9945128830', 'FBLSS0112', 1900, 'MONDAY', 'PAID'],
  ['R22', 'Nabam Tada', '8974551206', 'FBLSS0086', 2099, 'WEDNESDAY', 'PAID'],
  ['R11', 'Imran Shaikh', '7760043915', 'FBLSS0129', 1700, 'MONDAY', 'OVERDUE'],
  ['R26', 'Lalit Chhetri', '8014772390', 'BLRSS0412', 1600, 'WEDNESDAY', 'PARTIAL'],
  ['R31', 'Sohail Ahmed', '9008216744', 'FBLSS0141', 1950, 'MONDAY', 'PAID'],
  ['R14', 'Prakash Bhandari', '9611308452', 'BLRSS0396', 1750, 'WEDNESDAY', 'PAID'],
  ['R38', 'Yash Karkera', '9535667021', 'BLRSS0403', 1999, 'MONDAY', 'OVERDUE'],
  ['R41', 'Girish Poojary', '8899140563', 'FBLSS0097', 1700, 'WEDNESDAY', 'PAID'],
];

/** Overdue riders the dashboard counts: 16. Two of them are designed rows. */
const OVERDUE_TARGET = 16;

function buildRiders(): Rider[] {
  const rng = mulberry32(9140824);
  const deployed = vehicles.filter((v) => v.state === 'DEPLOYED');
  const out: Rider[] = [];
  const takenVehicles = new Set<string>();

  // Designed rows first. Three of them name bikes that are not in the twelve
  // drawn on the list artboard, so those bikes are adopted from the generated
  // deployed pool rather than invented.
  const spare = deployed.filter((v) => !v.currentRiderName);
  let spareIdx = 0;
  for (const [id, name, phone, vehicleId, plan, billingDay, paymentStatus] of DESIGNED) {
    const known = deployed.find((v) => v.id === vehicleId);
    const bike = known ?? spare[spareIdx++];
    takenVehicles.add(bike.id);
    out.push({
      id,
      name,
      phone,
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
      planAmount: plan * 100,
      billingDay,
      currentVehicleId: bike.id,
      onboardedOn: '2026-04-08',
      paymentStatus,
    });
  }

  let n = 44;
  for (const bike of deployed) {
    if (takenVehicles.has(bike.id)) continue;
    const id = `R${String(n++).padStart(2, '0')}`;
    const name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
    out.push({
      id,
      name,
      phone: `${6 + Math.floor(rng() * 4)}${String(Math.floor(rng() * 1e9)).padStart(9, '0')}`,
      status: 'ACTIVE',
      kycStatus: rng() < 0.06 ? 'PENDING' : 'VERIFIED',
      planAmount: pick(rng, [1600, 1700, 1750, 1900, 1950, 1999, 2099]) * 100,
      billingDay: out.filter((r) => r.billingDay === 'MONDAY').length < 58 ? 'MONDAY' : 'WEDNESDAY',
      currentVehicleId: bike.id,
      onboardedOn: `202${5 + Math.floor(rng() * 2)}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`,
      paymentStatus: 'PENDING',
    });
  }

  // Spread the remaining overdue and partial flags over the generated riders.
  const generated = out.filter((r) => r.paymentStatus === 'PENDING');
  let overdueLeft = OVERDUE_TARGET - out.filter((r) => r.paymentStatus === 'OVERDUE').length;
  for (const r of generated) {
    if (overdueLeft > 0 && rng() < 0.25) {
      r.paymentStatus = 'OVERDUE';
      overdueLeft -= 1;
    } else {
      r.paymentStatus = rng() < 0.08 ? 'PARTIAL' : 'PAID';
    }
  }

  // Close the loop: every deployed bike now names its rider.
  for (const r of out) {
    const bike = vehicles.find((v) => v.id === r.currentVehicleId);
    if (bike) {
      bike.currentRiderId = r.id;
      bike.currentRiderName = r.name;
    }
  }
  return out;
}

export const riders: Rider[] = buildRiders();

export const staff = STAFF;
