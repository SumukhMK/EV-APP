import type { RiderCharge, ServiceLiability } from '../types';
import { riders } from './riders';

/**
 * OWNER: SMK (contract + mock). One list of what an assistance-desk job has
 * charged a rider, read by both the weekly run and a rider's own ledger.
 *
 * `mocks/payments.ts` derives `serviceCharges` and `arrears` from this list —
 * it never invents an amount, and it can no longer sit at zero once a job
 * closes with the rider on the hook for the cost.
 */
export const riderCharges: RiderCharge[] = [];

let nextId = 1;
const iso = () => new Date().toISOString().slice(0, 10);

/** Matches the current run's period starts in mocks/payments.ts. */
const CURRENT_PERIOD_START: Record<'MONDAY' | 'WEDNESDAY', string> = {
  MONDAY: '2026-08-24',
  WEDNESDAY: '2026-08-26',
};

/** The week before the current run — fixtures use it to show money carried forward. */
export const PREVIOUS_PERIOD_START: Record<'MONDAY' | 'WEDNESDAY', string> = {
  MONDAY: '2026-08-17',
  WEDNESDAY: '2026-08-19',
};

export function addRiderCharge(input: {
  riderId: string;
  serviceJobId: string;
  vehicleId: string;
  amount: number;
  liability: ServiceLiability;
  /** Fixtures only: bill an earlier week so arrears have something to show. */
  period?: 'CURRENT' | 'PREVIOUS';
}): RiderCharge {
  const rider = riders.find((r) => r.id === input.riderId);
  const table = input.period === 'PREVIOUS' ? PREVIOUS_PERIOD_START : CURRENT_PERIOD_START;
  const periodStart = table[rider?.billingDay ?? 'MONDAY'];

  const charge: RiderCharge = {
    id: `CHG-${String(nextId++).padStart(4, '0')}`,
    riderId: input.riderId,
    serviceJobId: input.serviceJobId,
    vehicleId: input.vehicleId,
    amount: input.amount,
    liability: input.liability,
    // A DEPOSIT charge settles against the deposit at service release, not through
    // the weekly run, so it is recorded closed from the moment it is posted.
    status: input.liability === 'DEPOSIT' ? 'SETTLED' : 'OPEN',
    periodStart,
    createdOn: iso(),
  };
  riderCharges.push(charge);
  return charge;
}

/** RIDER-liability charges billed in this exact period — the run's own week. */
export function chargesForPeriod(riderId: string, periodStart: string): RiderCharge[] {
  return riderCharges.filter(
    (c) => c.riderId === riderId && c.periodStart === periodStart && c.liability === 'RIDER',
  );
}

/** Open RIDER charges from an earlier period — money still carried forward. */
export function arrearsBeforePeriod(riderId: string, periodStart: string): RiderCharge[] {
  return riderCharges.filter(
    (c) =>
      c.riderId === riderId &&
      c.liability === 'RIDER' &&
      c.status === 'OPEN' &&
      c.periodStart < periodStart,
  );
}
