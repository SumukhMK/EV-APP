import { z } from 'zod';
import { VEHICLE_STATES } from '../../types/vehicle';

/**
 * Validation for the three assignment forms (screens 10–12).
 *
 * All three carry the rider and the bike as required fields rather than
 * reading them off the URL and hoping: these screens are reachable directly,
 * with no rider chosen, and a form that silently submits an empty rider id is
 * how the spreadsheet ended up with orphaned rows.
 *
 * Money is in rupees here and converted to paise at the edge, matching the
 * onboarding form, and registered with `valueAsNumber` so the field and the
 * schema agree on the type.
 *
 * NOTE FOR SMK REVIEW: `nextVehicleState` was added to exchange and deboard
 * (Tasks 18–19). It used to be computed silently from the return condition in
 * the mutation; it is now an operator-overridable form field, bounded by the
 * vehicle transitions on the screen.
 */

const RETURN_CONDITION = z.enum(['NONE', 'MINOR', 'MAJOR', 'ACCIDENT']);

const NEXT_VEHICLE_STATE = z.enum(VEHICLE_STATES);

export const assignVehicleSchema = z.object({
  riderId: z.string().min(1, 'Pick a rider'),
  vehicleId: z.string().min(1, 'Pick a bike'),
  startedOn: z.string().min(1, 'Assignment date is required'),
  note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
});

export type AssignVehicleValues = z.infer<typeof assignVehicleSchema>;

export const exchangeVehicleSchema = z
  .object({
    riderId: z.string().min(1, 'Pick a rider'),
    fromVehicleId: z.string().min(1, 'This rider has no bike to exchange'),
    toVehicleId: z.string().min(1, 'Pick the replacement bike'),
    occurredOn: z.string().min(1, 'Exchange date is required'),
    reason: z.enum(['BREAKDOWN', 'BATTERY_ISSUE', 'ACCIDENT', 'SERVICE_REQUIRED', 'RIDER_REQUEST', 'UPGRADE', 'OTHER']),
    returnCondition: RETURN_CONDITION,
    /** Defaulted from the condition, overridable by the operator. */
    nextVehicleState: NEXT_VEHICLE_STATE,
    note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
  })
  .refine((v) => v.toVehicleId !== v.fromVehicleId, {
    message: 'Pick a different bike',
    path: ['toVehicleId'],
  });

export type ExchangeVehicleValues = z.infer<typeof exchangeVehicleSchema>;

export const deboardRiderSchema = z.object({
  riderId: z.string().min(1, 'Pick a rider'),
  vehicleId: z.string().min(1, 'This rider has no bike to return'),
  returnedOn: z.string().min(1, 'Return date is required'),
  reason: z.enum([
    'RECOVERED_BY_TEAM', 'ACCIDENT', 'LEFT_AT_HUB', 'LEFT_AT_ROADSIDE',
    'SERVICE_ISSUE', 'PAYMENT_ISSUE', 'WENT_HOME', 'RETURNED', 'OTHER',
  ]),
  returnCondition: RETURN_CONDITION,
  /** Defaulted from the condition, overridable by the operator. */
  nextVehicleState: NEXT_VEHICLE_STATE,
  outstandingRentRupees: z
    .number({ message: 'Enter an amount in rupees' })
    .int('Enter whole rupees')
    .min(0, 'Outstanding rent cannot be negative'),
  depositRefundRupees: z
    .number({ message: 'Enter an amount in rupees' })
    .int('Enter whole rupees')
    .min(0, 'A refund cannot be negative — a deduction larger than the deposit is an amount owed, and how that is recorded has not been decided yet'),
  note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
});

export type DeboardRiderValues = z.infer<typeof deboardRiderSchema>;

/** Today, so all three forms open on the date the event is actually happening. */
export const today = () => new Date().toISOString().slice(0, 10);