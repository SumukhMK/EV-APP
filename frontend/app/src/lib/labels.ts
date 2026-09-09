import type { StatusTone } from '../theme/tokens';
import type {
  DeboardReason,
  DunningStage,
  ExchangeReason,
  KycStatus,
  PaymentDay,
  PaymentMethod,
  PaymentStatus,
  ReturnCondition,
  RiderStatus,
  UserRole,
  UserStatus,
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
  RECOVERY: 'Recovery',
  UNDER_REPAIR: 'Under repair',
  QC_PENDING: 'QC pending',
  ACCIDENT: 'Accident',
  RETIRED: 'Scrapped',
};

export const VEHICLE_STATE_TONE: Record<VehicleState, StatusTone> = {
  INDUCTED: 'neutral',
  READY_TO_DEPLOY: 'good',
  DEPLOYED: 'accent',
  RETURNED: 'neutral',
  RECOVERY: 'warn',
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
  DEPLOYED: ['RETURNED', 'ACCIDENT', 'RECOVERY'],
  RETURNED: ['UNDER_REPAIR', 'QC_PENDING', 'READY_TO_DEPLOY'],
  RECOVERY: ['UNDER_REPAIR', 'QC_PENDING', 'READY_TO_DEPLOY', 'RETIRED'],
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
  BATTERY_ISSUE: 'Battery issue',
  ACCIDENT: 'Accident',
  SERVICE_REQUIRED: 'Service required',
  RIDER_REQUEST: 'Rider request',
  UPGRADE: 'Plan upgrade',
  OTHER: 'Other',
};

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super admin',
  TENANT_ADMIN: 'Tenant admin',
  FLEET_STAFF: 'Fleet staff',
  SERVICE_MANAGER: 'Service manager',
};

export const USER_ROLE_TONE: Record<UserRole, StatusTone> = {
  SUPER_ADMIN: 'accent',
  TENANT_ADMIN: 'good',
  FLEET_STAFF: 'neutral',
  SERVICE_MANAGER: 'caution',
};

/**
 * A one-line description of what each role is for. Enforced server-side later;
 * shown here so the screen explains the roles it lists rather than assuming
 * the reader already knows them.
 */
export const USER_ROLE_SCOPE: Record<UserRole, string> = {
  SUPER_ADMIN: 'The platform owner. Every tenant, every bike, plans and the shared blacklist.',
  TENANT_ADMIN: 'Runs one fleet end to end — bikes, riders, rent, service, dashboards.',
  FLEET_STAFF: 'Day-to-day fleet work: inductions, inspections, recording returns.',
  SERVICE_MANAGER: 'The workshop: repairs, QC decisions and service charges.',
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  INVITED: 'Invited',
  DISABLED: 'Disabled',
};

export const USER_STATUS_TONE: Record<UserStatus, StatusTone> = {
  ACTIVE: 'good',
  INVITED: 'caution',
  DISABLED: 'neutral',
};

/** Today's swap networks. A price list, not a schema — hence not an enum. */
export const BATTERY_VENDORS = [
  'Sun Mobility',
  'Battery Smart',
  'Yuma',
  'Honda Swap',
] as const;

/** Today's OEMs, same reasoning. */
export const VEHICLE_MAKES = ['e-Connects', 'e-Sprinto', 'OPG Mobility', 'Odysee', 'Stella'] as const;

export const DEBOARD_REASON_LABEL: Record<DeboardReason, string> = {
  RECOVERED_BY_TEAM: 'Recovered by team',
  ACCIDENT: 'Accident',
  LEFT_AT_HUB: 'Rider left it at the hub',
  LEFT_AT_ROADSIDE: 'Rider left it at the roadside',
  SERVICE_ISSUE: 'Service issue',
  PAYMENT_ISSUE: 'Payment issue',
  WENT_HOME: 'Gone to hometown',
  RETURNED: 'Returned',
  OTHER: 'Other',
};

export const PAYMENT_DAY_LABEL: Record<PaymentDay, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

/**
 * Today's price list, in paise, offered as suggestions in a combobox that
 * still accepts a typed amount. Not an enum: a tier change would otherwise be
 * a repo change, and Ashok changes them.
 */
export const WEEKLY_PLAN_TIERS = [179900, 189900, 199900, 209900, 219900] as const;
export const DEPOSIT_TIERS = [500000, 1000000] as const;

/** The gig platforms riders work for. Free text is allowed alongside. */
export const WORKING_PLATFORMS = [
  'Zomato', 'Swiggy', 'Ownly', 'EatSure', 'Zepto', 'Blinkit',
  'Swiggy Instamart', 'Flipkart Minutes', 'BigBasket', 'Porter',
  'Borzo', 'Dunzo', 'Other',
] as const;

/**
 * Where a bike lands when it comes back. This is the whole reason a return
 * captures a condition: an undamaged bike goes to QC before it can be let out
 * again, and a damaged one cannot skip the workshop on someone's say-so.
 */
export const CONDITION_DEFAULT_STATE: Record<ReturnCondition, VehicleState> = {
  NONE: 'QC_PENDING',
  MINOR: 'UNDER_REPAIR',
  MAJOR: 'UNDER_REPAIR',
  ACCIDENT: 'ACCIDENT',
};
