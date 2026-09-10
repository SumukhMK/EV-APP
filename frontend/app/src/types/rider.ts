import type { Iso8601, Paise } from './common';

export const RIDER_STATUSES = ['ACTIVE', 'INACTIVE', 'BLACKLISTED'] as const;

export type RiderStatus = (typeof RIDER_STATUSES)[number];
export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
/** Ashok runs two billing cycles today. Both must survive to the backend. */
export type BillingDay = 'MONDAY' | 'WEDNESDAY';

/**
 * The day this rider says they pay.
 *
 * NOT the billing period. `BillingDay` above drives the Monday and Wednesday
 * runs, and the prototype's payment view is fixed Wednesday→Tuesday — yet its
 * rider form offers all seven days. Those two cannot both be true, so this is
 * captured and displayed and feeds no calculation until Ashok says which wins.
 */
export type PaymentDay =
  | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY'
  | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export type Platform =
  | 'Zomato'
  | 'Swiggy'
  | 'Swiggy Instamart'
  | 'Zepto'
  | 'Blinkit'
  | 'Flipkart Minutes'
  | 'Porter'
  | 'Dunzo'
  | 'Ownly'
  | 'EatSure'
  | 'BigBasket'
  | 'Borzo'
  | 'Other';

/** Which of the five identity fields have completed their OTP round-trip. */
export interface RiderVerification {
  aadhaarVerified: boolean;
  primaryVerified: boolean;
  whatsappVerified: boolean;
  alternate1Verified: boolean;
  alternate2Verified: boolean;
}

export interface Rider {
  id: string;
  name: string;
  phone: string;
  status: RiderStatus;
  kycStatus: KycStatus;
  /** Weekly rent in paise. */
  planAmount: Paise;
  /**
   * The deposit held against this rider, in paise. Settled on deboard — the
   * deboard screen computes the refund from it.
   *
   * NOTE FOR SMK REVIEW: added for Task 19. The deposit previously lived only
   * in `OnboardRiderRequest`; the deboard screen needs it on the record to
   * show what is held and what comes back.
   */
  depositHeld: Paise;
  billingDay: BillingDay;
  currentVehicleId: string | null;
  onboardedOn: Iso8601;
  /** Derived from the current period; the list screen colours a chip with it. */
  paymentStatus: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING';
  platform: Platform;
  /** The day this rider says they pay. Captured, not acted on — see PaymentDay. */
  paymentDay: PaymentDay;
}

/**
 * What the onboard-rider form sends (screen 09).
 *
 * A new rider lands on the register with no bike and KYC pending — both are
 * consequences of the workflow, not inputs, so the form does not offer them.
 * Assignment is a separate recorded event; see `AssignVehicleRequest`.
 */
export interface OnboardRiderRequest {
  // Identity — step 1. Aadhaar is the record the team actually trusts.
  aadhaarNumber: string;
  name: string;
  permanentAddress: string;

  // Contact — step 2. Four numbers because one rider is reachable on none of
  // them by the time a bike needs recovering.
  phone: string;
  whatsappNumber: string;
  alternateNumber1: string;
  alternateNumber2: string;

  // Local address — step 3.
  localAddress: string;
  city: string;
  state: string;
  pinCode: string;
  /** "12.892425,77.649213" as captured on the phone. */
  locationCoordinates: string | null;

  // Optional documents — step 4.
  panNumber: string | null;
  drivingLicence: string | null;

  // Commercial — step 5.
  workingPlatform: string;
  platformRiderId: string | null;
  planAmount: Paise;
  billingDay: BillingDay;
  /** Captured, not acted on. See PaymentDay. */
  paymentDay: PaymentDay;
  depositPlan: Paise;
  depositPaid: Paise;
  onboardedOn: Iso8601;

  /** Every flag must be true before the request is allowed to be sent. */
  verification: RiderVerification;

  /**
   * The bike handed over at the counter. Optional: the prototype assigns one
   * during onboarding, but our contract keeps assignment a separate recorded
   * event, so a rider can still be registered with nothing to ride.
   */
  vehicleId: string | null;
}
