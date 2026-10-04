import { z } from 'zod';

/** Exactly YYYY-MM-DD, and a date the calendar has: 2026-02-30 is not. */
function isRealIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Today in the browser's calendar, as the same YYYY-MM-DD the field holds. */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Validation for the add-vehicle form.
 *
 * Rules taken from what the registry already enforces on paper — the 17
 * character chassis and the unique vehicle id. Anything we were told but
 * cannot confirm is left as a plain optional field with a note on the screen,
 * rather than guessed at here.
 */
export const addVehicleSchema = z.object({
  id: z
    .string()
    .trim()
    .min(4, 'Vehicle id is required')
    .max(20, 'Vehicle id is too long')
    .regex(/^[A-Z0-9]+$/, 'Use capitals and digits only'),
  chassisNumber: z
    .string()
    .trim()
    .length(17, 'Chassis must be 17 characters')
    .regex(/^[A-Z0-9]+$/, 'Use capitals and digits only'),
  hub: z.string().trim().min(1, 'Hub is required'),
  // A real calendar date that has happened. The date box is a masked text
  // field, and a slip produced "0109-20-26" — "not empty" let it through,
  // the API refused it, and the screen said "Request body is missing or
  // malformed" with nothing highlighted. The sentence belongs here, on the field.
  purchaseDate: z
    .string()
    .min(1, 'Purchase date is required')
    .refine((s) => s === '' || isRealIsoDate(s), 'Enter a real date as YYYY-MM-DD')
    .refine((s) => s === '' || !isRealIsoDate(s) || s <= todayIso(), 'Purchase date cannot be in the future'),
  make: z.string().trim().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  batteryType: z.enum(['Sun Mobility', 'Battery Smart', 'Yuma', 'Honda Swap']),
  batteryVendor: z.string().trim().optional(),
  motorNumber: z.string().trim().optional(),
  controllerNumber: z.string().trim().optional(),
  rfidTag: z.string().trim().optional(),
  notes: z.string().trim().max(500, 'Keep notes under 500 characters').optional(),
});

export type AddVehicleValues = z.infer<typeof addVehicleSchema>;

export const ADD_VEHICLE_DEFAULTS: AddVehicleValues = {
  id: '',
  chassisNumber: '',
  hub: 'Bengaluru',
  purchaseDate: '',
  make: '',
  model: '',
  batteryType: 'Sun Mobility',
  batteryVendor: '',
  motorNumber: '',
  controllerNumber: '',
  rfidTag: '',
  notes: '',
};

/**
 * Validation for editing an existing vehicle's record. Identity fields —
 * the vehicle id, the chassis number, the purchase date — are not asked for:
 * they are facts about how the bike entered the fleet, not corrections a desk
 * makes later.
 */
export const editVehicleSchema = z.object({
  hub: z.string().trim().min(1, 'Hub is required'),
  make: z.string().trim().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  batteryType: z.enum(['Sun Mobility', 'Battery Smart', 'Yuma', 'Honda Swap']),
  batteryVendor: z.string().trim().optional(),
  registrationNumber: z.string().trim().optional(),
  motorNumber: z.string().trim().optional(),
  controllerNumber: z.string().trim().optional(),
  rfidTag: z.string().trim().optional(),
});

export type EditVehicleValues = z.infer<typeof editVehicleSchema>;
