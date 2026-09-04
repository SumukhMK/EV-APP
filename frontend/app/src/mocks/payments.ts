import type {
  DunningStage,
  OverdueRider,
  PaymentMethod,
  PaymentPeriodRow,
  PaymentRun,
  Rider,
  RiderPaymentRow,
} from '../types';
import { riders } from './riders';
import { mulberry32, pick } from './seed';

const rupees = (n: number) => n * 100;

/** Artboard 15, the Monday 24 Aug run, verbatim. */
const DESIGNED_ROWS: PaymentPeriodRow[] = [
  row('R03', 'Dulan Hajong', 'BLRSS0428', 1750, 7, 1750, 0, 0, 1750, 'PAID'),
  row('R07', 'Ashwin Kamath', 'FBLSS0112', 1900, 7, 1900, 0, 0, 1900, 'PAID'),
  row('R11', 'Imran Shaikh', 'FBLSS0129', 1700, 6, 1458, 310, 0, 0, 'OVERDUE'),
  row('R14', 'Prakash Bhandari', 'BLRSS0396', 1750, 7, 1750, 0, 0, 1750, 'PAID'),
  row('R31', 'Sohail Ahmed', 'FBLSS0141', 1950, 7, 1950, 0, 500, 2450, 'PAID'),
  row('R38', 'Yash Karkera', 'BLRSS0403', 1999, 5, 1428, 0, 1000, 0, 'OVERDUE'),
  row('R22', 'Nabam Tada', 'FBLSS0086', 2099, 7, 2099, 180, 0, 2279, 'PAID'),
  row('R26', 'Lalit Chhetri', 'BLRSS0412', 1600, 7, 1600, 0, 0, 1100, 'PARTIAL'),
  row('R41', 'Girish Poojary', 'FBLSS0097', 1700, 7, 1700, 0, 0, 1700, 'PAID'),
  row('R19', 'Raju Debnath', 'FBLSS003B', 1999, 7, 1999, 420, 0, 1500, 'PARTIAL'),
];

function row(
  riderId: string,
  riderName: string,
  vehicleId: string,
  planRupees: number,
  daysBilled: number,
  billedRupees: number,
  serviceRupees: number,
  arrearsRupees: number,
  paidRupees: number,
  status: PaymentPeriodRow['status'],
): PaymentPeriodRow {
  return {
    riderId,
    riderName,
    vehicleId,
    planAmount: rupees(planRupees),
    daysBilled,
    perDayAmount: Math.round(rupees(planRupees) / 7),
    billedAmount: rupees(billedRupees),
    serviceCharges: rupees(serviceRupees),
    arrears: rupees(arrearsRupees),
    totalDue: rupees(billedRupees + serviceRupees + arrearsRupees),
    amountPaid: rupees(paidRupees),
    status,
  };
}

function buildRun(): PaymentRun {
  const designedIds = new Set(DESIGNED_ROWS.map((r) => r.riderId));
  const rest = riders
    .filter((r) => r.billingDay === 'MONDAY' && !designedIds.has(r.id))
    .map<PaymentPeriodRow>((r) => {
      const paid = r.paymentStatus === 'PAID';
      const partial = r.paymentStatus === 'PARTIAL';
      return {
        riderId: r.id,
        riderName: r.name,
        vehicleId: r.currentVehicleId ?? '—',
        planAmount: r.planAmount,
        daysBilled: 7,
        perDayAmount: Math.round(r.planAmount / 7),
        billedAmount: r.planAmount,
        serviceCharges: 0,
        arrears: 0,
        totalDue: r.planAmount,
        amountPaid: paid ? r.planAmount : partial ? Math.round(r.planAmount * 0.6) : 0,
        status: r.paymentStatus,
      };
    });

  return {
    periodStart: '2026-08-24',
    periodEnd: '2026-08-30',
    billingDay: 'MONDAY',
    rows: [...DESIGNED_ROWS, ...rest],
  };
}

export const mondayRun: PaymentRun = buildRun();

/**
 * Overdue is derived from the riders fixture, never listed separately — the
 * wireframe's own two artboards disagree (07 shows R19 and R26 as partial, 17
 * lists them as overdue), and a dashboard tile that contradicts the list under
 * it is the first thing a client notices. The designed rows below supply the
 * days and dunning stage for the riders they name; everyone else overdue gets
 * a derived one.
 */
const DESIGNED_DETAIL: Record<string, { days: number; amountRupees: number }> = {
  R38: { days: 26, amountRupees: 4856 },
  R11: { days: 19, amountRupees: 3536 },
  R29: { days: 17, amountRupees: 3398 },
  R35: { days: 12, amountRupees: 2850 },
  R26: { days: 9, amountRupees: 1600 },
  R19: { days: 5, amountRupees: 1919 },
  R09: { days: 4, amountRupees: 1700 },
  R17: { days: 3, amountRupees: 1692 },
};

function stageFor(days: number): DunningStage {
  if (days >= 21) return 'REPOSSESSION_DUE';
  if (days >= 14) return 'WARNING_2';
  if (days >= 7) return 'WARNING_1';
  return 'REMINDER_DUE';
}

export const overdueRiders: OverdueRider[] = riders
  .filter((r) => r.paymentStatus === 'OVERDUE')
  .map<OverdueRider>((r, i) => {
    const designed = DESIGNED_DETAIL[r.id];
    const days = designed?.days ?? 2 + ((i * 5) % 24);
    return {
      riderId: r.id,
      riderName: r.name,
      vehicleId: r.currentVehicleId ?? '—',
      daysOverdue: days,
      amountDue: designed ? designed.amountRupees * 100 : Math.round((r.planAmount / 7) * days),
      stage: stageFor(days),
    };
  })
  .sort((a, b) => b.daysOverdue - a.daysOverdue);

/**
 * A rider's own ledger, derived from their plan and billing day rather than
 * listed — the same reason `overdueRiders` is derived. The eight most recent
 * periods, newest first: enough to show a pattern, short enough to read
 * without a scroll inside the panel.
 *
 * The current period carries the rider's live `paymentStatus`, so the chip on
 * the list screen and the top row of this table can never disagree. Earlier
 * periods are settled — a rider carrying three months of arrears is not a
 * state the register allows, and inventing one here would be inventing a rule.
 */
const PERIODS = 8;
const DAY_MS = 86_400_000;

/** The Monday run's period start, so a rider's weeks line up with the run. */
const CURRENT_PERIOD_START = Date.parse('2026-08-24T00:00:00+05:30');

export function riderPaymentHistory(rider: Rider): RiderPaymentRow[] {
  // Wednesday riders are billed three days later in the same week.
  const offset = rider.billingDay === 'WEDNESDAY' ? 2 * DAY_MS : 0;
  const onboarded = Date.parse(rider.onboardedOn);
  const rng = mulberry32(hash(rider.id));
  const out: RiderPaymentRow[] = [];

  for (let i = 0; i < PERIODS; i++) {
    const start = CURRENT_PERIOD_START + offset - i * 7 * DAY_MS;
    // Nothing is billed before the rider joined.
    if (start < onboarded) break;

    const status = i === 0 ? rider.paymentStatus : 'PAID';
    const amountPaid =
      status === 'PAID'
        ? rider.planAmount
        : status === 'PARTIAL'
          ? Math.round(rider.planAmount * 0.6)
          : 0;

    out.push({
      id: `${rider.id}-${iso(start)}`,
      periodStart: iso(start),
      periodEnd: iso(start + 6 * DAY_MS),
      totalDue: rider.planAmount,
      amountPaid,
      status,
      method: amountPaid === 0 ? null : pick(rng, PAYMENT_METHODS),
    });
  }

  return out;
}

const PAYMENT_METHODS: readonly PaymentMethod[] = ['UPI', 'CASH', 'BANK_TRANSFER'];

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Stable per-rider seed, so a reload does not reshuffle their payment methods. */
function hash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = (h ^ id.charCodeAt(i)) * 16777619;
  return h >>> 0;
}
