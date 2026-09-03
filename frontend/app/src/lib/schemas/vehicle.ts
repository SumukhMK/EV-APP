import { z } from 'zod';

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
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  make: z.string().trim().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  batteryType: z.enum(['SWAPPABLE', 'FIXED']),
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
  batteryType: 'SWAPPABLE',
  motorNumber: '',
  controllerNumber: '',
  rfidTag: '',
  notes: '',
};
