import type { DunningStage, OverdueRider, PaymentPeriodRow, PaymentRun } from '../types';
import { riders } from './riders';

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
