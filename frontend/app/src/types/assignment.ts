import type { Iso8601, Paise } from './common';

/**
 * OWNER: SMK (contract). The three recorded assignment events — assign,
 * exchange, deboard.
 *
 * The spreadsheet Ashok runs today overwrites the rider's vehicle column, so
 * an exchange loses the fact that it happened. Here every one of the three is
 * its own request with its own timestamp, which is what lets the assignment
 * history on screen 04 be a history rather than a current value.
 */

/** Condition a bike comes back in. Decides the state it lands in. */
export type ReturnCondition = 'NONE' | 'MINOR' | 'MAJOR' | 'ACCIDENT';

export type ExchangeReason = 'BREAKDOWN' | 'ACCIDENT' | 'RIDER_REQUEST' | 'UPGRADE';

export interface AssignVehicleRequest {
  riderId: string;
  vehicleId: string;
  startedOn: Iso8601;
  note?: string;
}

/**
 * Two events, not an overwrite: the old assignment closes and a new one opens.
 * The returned bike takes its next state from `returnCondition`, exactly as it
 * would on a deboard, so a swapped-out bike cannot skip the workshop.
 */
export interface ExchangeVehicleRequest {
  riderId: string;
  fromVehicleId: string;
  toVehicleId: string;
  occurredOn: Iso8601;
  reason: ExchangeReason;
  returnCondition: ReturnCondition;
  note?: string;
}

export interface DeboardRiderRequest {
  riderId: string;
  vehicleId: string;
  returnedOn: Iso8601;
  returnCondition: ReturnCondition;
  /** Rent still owed at the point the bike comes back. */
  outstandingRent: Paise;
  /** Deposit handed back after deductions. */
  depositRefund: Paise;
  note?: string;
}
