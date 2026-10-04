import { describe, expect, it } from 'vitest';
import { ADD_VEHICLE_DEFAULTS, addVehicleSchema } from './vehicle';

/**
 * The purchase date must be a real calendar date that has happened.
 *
 * The date field is a masked text box, and a slip of the fingers produced
 * "0109-20-26" — which the schema accepted as "not empty", the API rejected
 * as unparseable, and the screen reported as "Request body is missing or
 * malformed" with no field highlighted. The schema is where the sentence
 * belongs.
 */
const valid = {
  ...ADD_VEHICLE_DEFAULTS,
  id: 'BLRSS0451',
  chassisNumber: 'SESEAG03202300451',
  make: 'e-Connects',
  model: 'Eagle-SunM',
  purchaseDate: '2026-09-01',
};

describe('addVehicleSchema purchase date', () => {
  it('accepts a real past date', () => {
    expect(addVehicleSchema.safeParse(valid).success).toBe(true);
  });

  it.each(['0109-20-26', '2026-13-01', '2026-02-30', '01/09/2026', '2026-9-1'])(
    'rejects %s as not a real date',
    (purchaseDate) => {
      const result = addVehicleSchema.safeParse({ ...valid, purchaseDate });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.message)).toContain('Enter a real date as YYYY-MM-DD');
      }
    },
  );

  it('rejects a date in the future', () => {
    const next = new Date();
    next.setFullYear(next.getFullYear() + 1);
    const result = addVehicleSchema.safeParse({ ...valid, purchaseDate: next.toISOString().slice(0, 10) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Purchase date cannot be in the future');
    }
  });

  it('still says when it is missing', () => {
    const result = addVehicleSchema.safeParse({ ...valid, purchaseDate: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Purchase date is required');
    }
  });
});
