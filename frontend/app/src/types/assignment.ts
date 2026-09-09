import type { Iso8601, Paise } from './common';
import type { VehicleState } from './vehicle';

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

export type ExchangeReason =
  | 'BREAKDOWN'
  | 'BATTERY_ISSUE'
  | 'ACCIDENT'
  | 'SERVICE_REQUIRED'
  | 'RIDER_REQUEST'
  | 'UPGRADE'
  | 'OTHER';

/**
 * Why a rider gave the bike back.
 *
 * Separate from `ReturnCondition`, which is what shape the bike is in. "Went
 * to hometown" and "Minor damage" are answers to different questions, and the
 * prototype asks both — a reason and an explicit next status — because the
 * operator routinely overrides the obvious routing. Collapsing them would make
 * that override impossible to express.
 */
export type DeboardReason =
  | 'RECOVERED_BY_TEAM'
  | 'ACCIDENT'
  | 'LEFT_AT_HUB'
  | 'LEFT_AT_ROADSIDE'
  | 'SERVICE_ISSUE'
  | 'PAYMENT_ISSUE'
  | 'WENT_HOME'
  | 'RETURNED'
  | 'OTHER';

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
  /** Defaulted from `returnCondition`, overridable by the operator. */
  nextVehicleState: VehicleState;
  note?: string;
}

export interface DeboardRiderRequest {
  riderId: string;
  vehicleId: string;
  returnedOn: Iso8601;
  returnCondition: ReturnCondition;
  reason: DeboardReason;
  /** Defaulted from `returnCondition`, overridable by the operator. */
  nextVehicleState: VehicleState;
  /** Rent still owed at the point the bike comes back. */
  outstandingRent: Paise;
  /** Deposit handed back after deductions. */
  depositRefund: Paise;
  note?: string;
}
