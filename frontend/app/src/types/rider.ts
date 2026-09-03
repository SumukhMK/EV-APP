import type { Iso8601, Paise } from './common';

export type RiderStatus = 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED';
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
