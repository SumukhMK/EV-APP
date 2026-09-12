import type { BillingDay, PaymentDay, PaymentMode, Platform, Rider } from '../types';
import { FIRST_NAMES, LAST_NAMES, STAFF, mulberry32, pick } from './seed';
import { vehicles } from './vehicles';

const PLATFORMS: readonly Platform[] = [
  'Zomato', 'Swiggy', 'Swiggy Instamart', 'Zepto', 'Blinkit',
  'Flipkart Minutes', 'Porter', 'Dunzo', 'Ownly', 'EatSure',
  'BigBasket', 'Borzo', 'Other',
];

const PAYMENT_DAYS: readonly PaymentDay[] = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
];

/**
 * Modes weighted the way the counter actually sees them: UPI is the norm, cash
 * is common, a bank transfer is the exception. A uniform third each would make
 * the register's new column look like noise rather than a fact about the book.
 */
const PAYMENT_MODES: readonly PaymentMode[] = [
  'UPI', 'UPI', 'UPI', 'UPI', 'UPI', 'UPI',
  'CASH', 'CASH', 'CASH',
  'BANK_TRANSFER',
];

/**
 * One rider per deployed bike — the registry's one-to-one rule. Building the
 * riders from the fleet (rather than side by side) is what keeps the two
 * fixtures from drifting: there is exactly one place a pairing is decided.
 *
 * The Monday/Wednesday split is 58/42 among riders who hold a bike, matching
 * the "58 riders billed" line in the audit log for the Monday run.
 *
 * Not every rider holds a bike, though — see NO_BIKE below. The one-to-one
 * rule says a bike has at most one rider, not that every rider has a bike.
 */

const DESIGNED: ReadonlyArray<
  [id: string, name: string, phone: string, vehicleId: string, planRupees: number, day: BillingDay, pay: Rider['paymentStatus'], platform: Platform, paymentDay: PaymentDay, depositRupees: number]
> = [
  ['R03', 'Dulan Hajong', '8453679575', 'BLRSS0428', 1750, 'MONDAY', 'PAID', 'Zomato', 'MONDAY', 3000],
  ['R19', 'Raju Debnath', '9862340117', 'FBLSS003B', 1999, 'WEDNESDAY', 'PARTIAL', 'Zepto', 'WEDNESDAY', 3000],
  ['R07', 'Ashwin Kamath', '9945128830', 'FBLSS0112', 1900, 'MONDAY', 'PAID', 'Swiggy', 'TUESDAY', 3000],
  ['R22', 'Nabam Tada', '8974551206', 'FBLSS0086', 2099, 'WEDNESDAY', 'PAID', 'Blinkit', 'THURSDAY', 5000],
  ['R11', 'Imran Shaikh', '7760043915', 'FBLSS0129', 1700, 'MONDAY', 'OVERDUE', 'Swiggy Instamart', 'FRIDAY', 3000],
  ['R26', 'Lalit Chhetri', '8014772390', 'BLRSS0412', 1600, 'WEDNESDAY', 'PARTIAL', 'Porter', 'SATURDAY', 2000],
  ['R31', 'Sohail Ahmed', '9008216744', 'FBLSS0141', 1950, 'MONDAY', 'PAID', 'Flipkart Minutes', 'SUNDAY', 3000],
  ['R14', 'Prakash Bhandari', '9611308452', 'BLRSS0396', 1750, 'WEDNESDAY', 'PAID', 'Dunzo', 'MONDAY', 3000],
  ['R38', 'Yash Karkera', '9535667021', 'BLRSS0403', 1999, 'MONDAY', 'OVERDUE', 'Zomato', 'WEDNESDAY', 3000],
  ['R41', 'Girish Poojary', '8899140563', 'FBLSS0097', 1700, 'WEDNESDAY', 'PAID', 'EatSure', 'FRIDAY', 2000],
];

/**
 * Riders on the register holding no bike. Three real situations, and the
 * register has always had all three:
 *
 *   - onboarded and waiting for a bike to come out of QC. The yard is the
 *     bottleneck, so this is the normal case, not an edge one.
 *   - deboarded: bike handed back, rider off the active register.
 *   - blacklisted: never gets another bike.
 *
 * Without these, screen 10 has nothing to assign to on a cold load and the
 * Inactive and Blacklisted facets on the register are permanently empty, so
 * three of the six rider states could never be seen.
 *
 * They are appended after the generated riders rather than mixed in, which is
 * what keeps the 58/42 billing split above from moving.
 */
const NO_BIKE: ReadonlyArray<
  [
    id: string,
    name: string,
    phone: string,
    planRupees: number,
    day: BillingDay,
    status: Rider['status'],
    kyc: Rider['kycStatus'],
    onboardedOn: string,
    platform: Platform,
    paymentDay: PaymentDay,
    depositRupees: number,
  ]
> = [
  // Waiting for a bike. KYC is not a blocker on assignment — the desk decides.
  ['R02', 'Anil Shetty', '9845012277', 1750, 'MONDAY', 'ACTIVE', 'VERIFIED', '2026-08-24', 'Zomato', 'MONDAY', 3000],
  ['R13', 'Faisal Khan', '7012238890', 1900, 'MONDAY', 'ACTIVE', 'VERIFIED', '2026-08-26', 'Swiggy', 'WEDNESDAY', 3000],
  ['R21', 'Mahesh Gowda', '8891447203', 1600, 'WEDNESDAY', 'ACTIVE', 'VERIFIED', '2026-08-27', 'Zepto', 'FRIDAY', 2000],
  ['R40', 'Deepak Rawat', '9632188054', 1999, 'MONDAY', 'ACTIVE', 'PENDING', '2026-08-31', 'Blinkit', 'TUESDAY', 3000],
  // Deboarded — the bike came back, the plan closed, the deposit was settled.
  ['R05', 'Vinod Naik', '9008773412', 1700, 'MONDAY', 'INACTIVE', 'VERIFIED', '2025-11-03', 'Porter', 'SATURDAY', 0],
  ['R28', 'Suresh Pillai', '8123409965', 1750, 'WEDNESDAY', 'INACTIVE', 'VERIFIED', '2026-01-19', 'Dunzo', 'SUNDAY', 0],
  // Off the register for good.
  ['R33', 'Ramesh Dubey', '7899220148', 1600, 'MONDAY', 'BLACKLISTED', 'REJECTED', '2025-09-15', 'Ownly', 'MONDAY', 0],
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
  for (const [id, name, phone, vehicleId, plan, billingDay, paymentStatus, platform, paymentDay, deposit] of DESIGNED) {
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
      depositHeld: deposit * 100,
      billingDay,
      currentVehicleId: bike.id,
      onboardedOn: '2026-04-08',
      paymentStatus,
      platform,
      paymentDay,
      paymentMode: pick(rng, PAYMENT_MODES),
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
      depositHeld: pick(rng, [2000, 3000, 5000]) * 100,
      billingDay: out.filter((r) => r.billingDay === 'MONDAY').length < 58 ? 'MONDAY' : 'WEDNESDAY',
      currentVehicleId: bike.id,
      onboardedOn: `202${5 + Math.floor(rng() * 2)}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`,
      paymentStatus: 'PENDING',
      platform: pick(rng, PLATFORMS),
      paymentDay: pick(rng, PAYMENT_DAYS),
      paymentMode: pick(rng, PAYMENT_MODES),
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

  // Appended after the overdue spread above, which rewrites every rider still
  // marked PENDING — a rider with no bike has nothing billed against them and
  // must not be handed one of the sixteen overdue flags.
  for (const [id, name, phone, plan, billingDay, status, kycStatus, onboardedOn, platform, paymentDay, deposit] of NO_BIKE) {
    out.push({
      id,
      name,
      phone,
      status,
      kycStatus,
      planAmount: plan * 100,
      depositHeld: deposit * 100,
      billingDay,
      currentVehicleId: null,
      onboardedOn,
      paymentStatus: 'PENDING',
      platform,
      paymentDay,
      paymentMode: pick(rng, PAYMENT_MODES),
    });
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
