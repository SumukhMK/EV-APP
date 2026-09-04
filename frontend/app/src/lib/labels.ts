import type { StatusTone } from '../theme/tokens';
import type {
  DunningStage,
  ExchangeReason,
  KycStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnCondition,
  RiderStatus,
  VehicleState,
} from '../types';

/**
 * Wire enum → the words Ashok's team actually uses, plus the one colour each
 * is allowed to take. Screens never spell a status themselves.
 */

export const VEHICLE_STATE_LABEL: Record<VehicleState, string> = {
  INDUCTED: 'Inducted',
  READY_TO_DEPLOY: 'Ready to deploy',
  DEPLOYED: 'Deployed',
  RETURNED: 'Returned',
  UNDER_REPAIR: 'Under repair',
  QC_PENDING: 'QC pending',
  ACCIDENT: 'Accident',
  RETIRED: 'Retired',
};

export const VEHICLE_STATE_TONE: Record<VehicleState, StatusTone> = {
  INDUCTED: 'neutral',
  READY_TO_DEPLOY: 'good',
  DEPLOYED: 'accent',
  RETURNED: 'neutral',
  UNDER_REPAIR: 'warn',
  QC_PENDING: 'caution',
  ACCIDENT: 'bad',
  RETIRED: 'neutral',
};

/**
 * The only transitions the UI offers. Enforced server-side later; until then
 * this is what stops the demo showing a nonsense move.
 */
export const VEHICLE_TRANSITIONS: Record<VehicleState, VehicleState[]> = {
  INDUCTED: ['READY_TO_DEPLOY', 'UNDER_REPAIR'],
  READY_TO_DEPLOY: ['DEPLOYED', 'UNDER_REPAIR', 'RETIRED'],
  DEPLOYED: ['RETURNED', 'ACCIDENT'],
  RETURNED: ['UNDER_REPAIR', 'QC_PENDING', 'READY_TO_DEPLOY'],
  UNDER_REPAIR: ['QC_PENDING', 'ACCIDENT', 'RETIRED'],
  QC_PENDING: ['READY_TO_DEPLOY', 'UNDER_REPAIR'],
  ACCIDENT: ['UNDER_REPAIR', 'RETIRED'],
  RETIRED: [],
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PAID: 'Paid',
  PARTIAL: 'Partial',
  OVERDUE: 'Overdue',
  PENDING: 'Pending',
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, StatusTone> = {
  PAID: 'good',
  PARTIAL: 'caution',
  OVERDUE: 'bad',
  PENDING: 'neutral',
};

export const RIDER_STATUS_LABEL: Record<RiderStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  BLACKLISTED: 'Blacklisted',
};

export const RIDER_STATUS_TONE: Record<RiderStatus, StatusTone> = {
  ACTIVE: 'good',
  INACTIVE: 'neutral',
  BLACKLISTED: 'bad',
};

export const KYC_STATUS_LABEL: Record<KycStatus, string> = {
  PENDING: 'KYC pending',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export const KYC_STATUS_TONE: Record<KycStatus, StatusTone> = {
  PENDING: 'caution',
  VERIFIED: 'good',
  REJECTED: 'bad',
};

export const DUNNING_LABEL: Record<DunningStage, string> = {
  REMINDER_DUE: 'Reminder due',
  WARNING_1: 'Warning 1',
  WARNING_2: 'Warning 2',
  REPOSSESSION_DUE: 'Repossession due',
};

export const DUNNING_TONE: Record<DunningStage, StatusTone> = {
  REMINDER_DUE: 'neutral',
  WARNING_1: 'caution',
  WARNING_2: 'warn',
  REPOSSESSION_DUE: 'bad',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  UPI: 'UPI',
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
};

export const RETURN_CONDITION_LABEL: Record<ReturnCondition, string> = {
  NONE: 'No damage',
  MINOR: 'Minor damage',
  MAJOR: 'Major damage',
  ACCIDENT: 'Accident',
};

export const RETURN_CONDITION_TONE: Record<ReturnCondition, StatusTone> = {
  NONE: 'good',
  MINOR: 'caution',
  MAJOR: 'warn',
  ACCIDENT: 'bad',
};

/**
 * Where a bike lands when it comes back. This is the whole reason a return
 * captures a condition: an undamaged bike goes to QC before it can be let out
 * again, and a damaged one cannot skip the workshop on someone's say-so.
 */
export const RETURN_CONDITION_NEXT_STATE: Record<ReturnCondition, VehicleState> = {
  NONE: 'RETURNED',
  MINOR: 'UNDER_REPAIR',
  MAJOR: 'UNDER_REPAIR',
  ACCIDENT: 'ACCIDENT',
};

export const EXCHANGE_REASON_LABEL: Record<ExchangeReason, string> = {
  BREAKDOWN: 'Breakdown',
  ACCIDENT: 'Accident',
  RIDER_REQUEST: 'Rider request',
  UPGRADE: 'Plan upgrade',
};
