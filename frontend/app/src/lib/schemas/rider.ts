import { z } from 'zod';

/**
 * Validation for the onboard-rider form (screen 09).
 *
 * Money is typed in rupees, because that is what a person at a desk has in
 * front of them, and converted to paise at the edge — the wire never sees a
 * rupee and the operator never types a paisa. Status and KYC are absent by
 * design: a rider joins ACTIVE with KYC pending, and verification is its own
 * recorded step.
 *
 * NOTE FOR SMK REVIEW: this schema was extended (Task 16) to carry every
 * field of `OnboardRiderRequest` — identity, contact, address, documents and
 * commercial. The identity and contact fields were previously held only in
 * RHF internal state; they are now validated here too, so the form and the
 * request can no longer disagree.
 */
export const onboardRiderSchema = z.object({
  // Identity — step 1. Aadhaar is the record the team actually trusts.
  aadhaarNumber: z
    .string()
    .trim()
    .regex(/^\d{12}$/, 'Aadhaar must be exactly 12 digits'),
  name: z
    .string()
    .trim()
    .min(3, 'Rider name is required')
    .max(60, 'Name is too long'),
  permanentAddress: z
    .string()
    .trim()
    .min(5, 'Permanent address is required')
    .max(200, 'Address is too long'),

  // Contact — step 2. One spare number beside the rider's own.
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10 digit Indian mobile number'),
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10 digit Indian mobile number'),
  alternateNumber1: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10 digit Indian mobile number'),

  // Address — step 3.
  localAddress: z
    .string()
    .trim()
    .min(5, 'Local address is required')
    .max(200, 'Address is too long'),
  city: z.string().trim().min(2, 'City is required'),
  state: z.string().trim().min(2, 'State is required'),
  pinCode: z.string().trim().regex(/^\d{6}$/, 'PIN must be exactly 6 digits'),
  /** "12.892425,77.649213" as captured on the phone. Optional. */
  locationCoordinates: z.string().trim().optional(),

  // Documents — step 3, both optional. Empty is fine; a filled one has to be
  // the real shape, because a half-typed PAN or licence is worse than none —
  // it looks captured and is not.
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{5}[0-9]{4}[A-Z])?$/, 'PAN must look like ABCDE1234F'),
  /**
   * Indian driving licence: two-letter state, two-digit RTO, four-digit year,
   * then a seven-digit serial — "KA0120239876543". A space or hyphen after the
   * RTO code is accepted because that is how it is printed on the card.
   */
  drivingLicence: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^([A-Z]{2}[0-9]{2}[ -]?(19|20)[0-9]{2}[0-9]{7})?$/,
      'Licence must look like KA0120239876543',
    ),

  // Commercial — step 4.
  workingPlatform: z.string().trim().min(1, 'Working platform is required'),
  platformRiderId: z.string().trim().optional(),
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
  /**
   * The day this rider says they pay. Captured, not acted on — the weekly run
   * is fixed Wednesday to Tuesday until Ashok says otherwise.
   */
  paymentDay: z.enum([
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY',
    'FRIDAY', 'SATURDAY', 'SUNDAY',
  ]),
  /**
   * How the rider has agreed to pay. The same three values a collection can be
   * recorded in, so the agreed mode is always one the counter can actually use.
   */
  paymentMode: z.enum(['UPI', 'CASH', 'BANK_TRANSFER']),
  depositRupees: z
    .number({ message: 'Enter the deposit in rupees' })
    .int('Enter whole rupees')
    .min(0, 'A deposit cannot be negative')
    .max(50_000, 'That deposit looks too high'),
  depositPaidRupees: z
    .number({ message: 'Enter an amount in rupees' })
    .int('Enter whole rupees')
    .min(0, 'Deposit paid cannot be negative')
    .max(50_000, 'That looks too high'),
  onboardedOn: z.string().min(1, 'Onboarding date is required'),
});

export type OnboardRiderValues = z.infer<typeof onboardRiderSchema>;

/**
 * The plan Ashok quotes most often, and today's date, so the form opens
 * usable. The deposit opens fully paid — the counter collects it in full
 * before a bike goes out.
 */
export const ONBOARD_RIDER_DEFAULTS: OnboardRiderValues = {
  aadhaarNumber: '',
  name: '',
  permanentAddress: '',
  phone: '',
  whatsappNumber: '',
  alternateNumber1: '',
  localAddress: '',
  city: '',
  state: '',
  pinCode: '',
  locationCoordinates: '',
  panNumber: '',
  drivingLicence: '',
  workingPlatform: 'Other',
  platformRiderId: '',
  planRupees: 1750,
  billingDay: 'MONDAY',
  paymentDay: 'MONDAY',
  // UPI is what most riders actually settle in; cash is the exception at the counter.
  paymentMode: 'UPI',
  depositRupees: 3000,
  depositPaidRupees: 3000,
  onboardedOn: new Date().toISOString().slice(0, 10),
};