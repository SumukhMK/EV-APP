import type { Iso8601, Paise } from './common';

export const RIDER_STATUSES = ['ACTIVE', 'INACTIVE', 'BLACKLISTED'] as const;

export type RiderStatus = (typeof RIDER_STATUSES)[number];
export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
/** Ashok runs two billing cycles today. Both must survive to the backend. */
export type BillingDay = 'MONDAY' | 'WEDNESDAY';

export interface Rider {
  id: string;
  name: string;
  phone: string;
  status: RiderStatus;
  kycStatus: KycStatus;
  /** Weekly rent in paise. */
  planAmount: Paise;
  billingDay: BillingDay;
  currentVehicleId: string | null;
  onboardedOn: Iso8601;
  /** Derived from the current period; the list screen colours a chip with it. */
  paymentStatus: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING';
}

/**
 * What the onboard-rider form sends (screen 09).
 *
 * A new rider lands on the register with no bike and KYC pending — both are
 * consequences of the workflow, not inputs, so the form does not offer them.
 * Assignment is a separate recorded event; see `AssignVehicleRequest`.
 */
export interface OnboardRiderRequest {
  name: string;
  phone: string;
  planAmount: Paise;
  billingDay: BillingDay;
  /** Security deposit collected at onboarding. */
  depositAmount: Paise;
  onboardedOn: Iso8601;
}
