import type {
  BillingDay,
  DunningStage,
  OverdueRider,
  Paise,
  PaymentMethod,
  PaymentPeriodRow,
  PaymentReceipt,
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

/**
 * A run is the riders in that cycle — one row each, no more and no fewer.
 *
 * It used to be `[...DESIGNED_ROWS, ...rest]`, which appended all ten rows
 * drawn on artboard 15 and then the Monday riders who were not among them.
 * Five of those ten (R14, R19, R22, R26, R41) bill on Wednesday, so the Monday
 * run carried 63 rows while the audit log recorded "58 riders billed" for the
 * same period — and it listed riders who are not in that cycle at all.
 *
 * Deriving the rows from the riders in the cycle and looking up the designed
 * amounts by id makes the two numbers one number. Both cycles are built the
 * same way, so the Wednesday run is as real as the Monday one and the screen
 * can be switched between them.
 */
function buildRun(billingDay: BillingDay): PaymentRun {
  const designed = new Map(DESIGNED_ROWS.map((r) => [r.riderId, r]));

  const rows = riders
    // A rider with no bike has no open plan, so there is nothing to bill.
    .filter((r) => r.currentVehicleId && r.billingDay === billingDay)
    .map<PaymentPeriodRow>((r) => {
      const asDrawn = designed.get(r.id);
      if (asDrawn) return asDrawn;

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

  // The Wednesday cycle bills the same week, three days later.
  const monday = billingDay === 'MONDAY';
  return {
    periodStart: monday ? '2026-08-24' : '2026-08-26',
    periodEnd: monday ? '2026-08-30' : '2026-09-01',
    billingDay,
    rows,
  };
}

export const mondayRun: PaymentRun = buildRun('MONDAY');
export const wednesdayRun: PaymentRun = buildRun('WEDNESDAY');

/** Both cycles, so a screen can ask for either by billing day. */
export const runsByDay: Record<BillingDay, PaymentRun> = {
  MONDAY: mondayRun,
  WEDNESDAY: wednesdayRun,
};

/**
 * A receipt for one rider's line in the current run (screen 16).
 *
 * Derived from that rider's row, never stored separately, for the same reason
 * the overdue list is derived: the run is the single source of the numbers, so
 * a receipt cannot drift from the run it came out of. The method, date and
 * reference are the only things a receipt adds, and they are seeded off the
 * rider id so a reload does not reissue a different receipt for the same week.
 *
 * Returns null when the rider is not in this run at all — the screen turns that
 * into a "no line in this period" state rather than inventing one.
 */
export function paymentReceiptFor(riderId: string): PaymentReceipt | null {
  // A rider sits in exactly one cycle, so find the run that actually bills
  // them rather than assuming Monday — otherwise every Wednesday rider's
  // receipt reads "no line in this period".
  const run = Object.values(runsByDay).find((r) => r.rows.some((x) => x.riderId === riderId));
  const row = run?.rows.find((r) => r.riderId === riderId);
  if (!run || !row) return null;

  const rng = mulberry32(hash(`receipt-${riderId}`));
  const collected = row.amountPaid > 0;
  const override = recordedPayments.get(riderId);
  const method = override?.method ?? (collected ? pick(rng, PAYMENT_METHODS) : null);

  // Payment lands within the billing week. Only a settled or part-settled row
  // carries a date at all.
  const paidOn = override?.paidOn ?? (collected
    ? iso(Date.parse(run.periodStart) + Math.floor(rng() * 4) * DAY_MS)
    : null);

  return {
    receiptNo: collected
      ? `RCPT-${run.periodStart.slice(0, 4)}-${hash(riderId).toString().slice(0, 4)}`
      : null,
    riderId: row.riderId,
    riderName: row.riderName,
    vehicleId: row.vehicleId,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    billingDay: run.billingDay,
    planAmount: row.planAmount,
    daysBilled: row.daysBilled,
    perDayAmount: row.perDayAmount,
    billedAmount: row.billedAmount,
    serviceCharges: row.serviceCharges,
    arrears: row.arrears,
    totalDue: row.totalDue,
    amountPaid: row.amountPaid,
    balance: row.totalDue - row.amountPaid,
    status: row.status,
    method,
    paidOn,
    reference:
      method === 'UPI'
        ? `${Math.floor(rng() * 1e12)}@okhdfcbank`
        : method === 'BANK_TRANSFER'
          ? `NEFT${Math.floor(rng() * 1e9)}`
          : null,
  };
}

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
      phone: r.phone,
      vehicleId: r.currentVehicleId ?? '—',
      daysOverdue: days,
      amountDue: designed ? designed.amountRupees * 100 : Math.round((r.planAmount / 7) * days),
      stage: stageFor(days),
    };
  })
  .sort((a, b) => b.daysOverdue - a.daysOverdue);

/**
 * Recording a payment against whichever run bills this rider.
 *
 * The runs and the receipts read the same row objects, so mutating one in
 * place is what makes the collection show up everywhere at once — the run line
 * flips, the receipt reissues, and the dashboard's outstanding figure follows
 * on the next read. This is the same simulated-write shape the QC and
 * assignment screens already use; it is not a real ledger, just a live cache.
 *
 * `recordedPayments` overrides the seeded method/date on the receipt so the
 * receipt shows how the money actually came in, not the fixture's guess.
 */
const recordedPayments = new Map<string, { method: PaymentMethod; paidOn: string }>();

export function recordPaymentInRun(
  riderId: string,
  amount: Paise,
  method: PaymentMethod,
): PaymentPeriodRow {
  const row = Object.values(runsByDay)
    .flatMap((r) => r.rows)
    .find((r) => r.riderId === riderId);
  if (!row) throw new Error(`No run line for ${riderId}`);

  row.amountPaid = Math.min(row.totalDue, row.amountPaid + amount);
  row.status = row.amountPaid >= row.totalDue ? 'PAID' : row.amountPaid > 0 ? 'PARTIAL' : row.status;
  recordedPayments.set(riderId, { method, paidOn: iso(Date.now()) });
  return { ...row };
}

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
  // No bike, no open plan, so nothing is being billed. For a deboarded rider
  // this under-reports — they do have a past ledger — but the fixture records
  // no deboard date, and deriving weeks up to a date we do not have would be
  // inventing the history rather than showing it.
  if (!rider.currentVehicleId) return [];

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
