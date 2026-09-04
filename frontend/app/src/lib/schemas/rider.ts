import { z } from 'zod';

/**
 * Validation for the onboard-rider form (screen 09).
 *
 * Money is typed in rupees, because that is what a person at a desk has in
 * front of them, and converted to paise at the edge — the wire never sees a
 * rupee and the operator never types a paisa. Status and KYC are absent by
 * design: a rider joins ACTIVE with KYC pending, and verification is its own
 * recorded step.
 */
export const onboardRiderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Rider name is required')
    .max(60, 'Name is too long'),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10 digit Indian mobile number'),
  /**
   * Weekly rent in rupees. The observed range is ₹1,600–₹2,099.
   *
   * Registered with `valueAsNumber`, so the field hands RHF a number and the
   * schema validates one. `z.coerce.number()` would type its own input as
   * `unknown` and take the form's types with it.
   */
  planRupees: z
    .number({ message: 'Enter the weekly rent in rupees' })
    .int('Enter whole rupees')
    .min(500, 'The weekly plan looks too low')
    .max(10_000, 'The weekly plan looks too high'),
  billingDay: z.enum(['MONDAY', 'WEDNESDAY']),
  depositRupees: z
    .number({ message: 'Enter the deposit in rupees' })
    .int('Enter whole rupees')
    .min(0, 'A deposit cannot be negative')
    .max(50_000, 'That deposit looks too high'),
  onboardedOn: z.string().min(1, 'Onboarding date is required'),
});

export type OnboardRiderValues = z.infer<typeof onboardRiderSchema>;

/** The plan Ashok quotes most often, and today's date, so the form opens usable. */
export const ONBOARD_RIDER_DEFAULTS: OnboardRiderValues = {
  name: '',
  phone: '',
  planRupees: 1750,
  billingDay: 'MONDAY',
  depositRupees: 3000,
  onboardedOn: new Date().toISOString().slice(0, 10),
};
