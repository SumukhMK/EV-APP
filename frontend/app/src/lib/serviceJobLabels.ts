import type { DamageCategory, RepairType, ServiceJobCategory, ServiceJobSource, ServiceLiability, ServiceQueue } from '../types';
import type { StatusTone } from '../theme/tokens';

export const CATEGORY_LABEL: Record<DamageCategory, string> = {
  NONE: 'No damage', MINOR: 'Small damage', MAJOR: 'Big damage', ACCIDENT: 'Accident',
};
export const CATEGORY_TONE: Record<DamageCategory, StatusTone> = {
  NONE: 'neutral', MINOR: 'caution', MAJOR: 'warn', ACCIDENT: 'bad',
};
export const SOURCE_LABEL: Record<ServiceJobSource, string> = {
  DEBOARD: 'Rider gave the bike back', RSA: 'Roadside help (RSA)', QRT: 'Rescue team (QRT)', WALK_IN: 'Rider came to the hub',
  EXCHANGE: 'Bike swap', INSPECTION: 'Routine check', REGISTRY: 'Older record', RECOVERY: 'Recovered from rider',
};
/** The two job-card boards. Distinct from CATEGORY_LABEL, which grades damage. */
export const SERVICE_CATEGORY_LABEL: Record<ServiceJobCategory, string> = {
  WALK_IN_RSA: 'Walk-in & RSA', HUB: 'Hub Service',
};
export const REPAIR_TYPE_LABEL: Record<RepairType, string> = {
  REPAIR_ONLY: 'Repair only', SPARE_PARTS: 'Spare parts', REPAIR_AND_SPARE_PARTS: 'Repair + spare parts',
};
/** How a hub job's bike got here — the "Return / Recovery Source" column. */
export const RETURN_SOURCE_LABEL: Record<ServiceJobSource, string> = {
  DEBOARD: 'Returned by rider', EXCHANGE: 'Returned in exchange', RECOVERY: 'Recovered from rider',
  QRT: 'QRT recovery', INSPECTION: 'Routine inspection', REGISTRY: 'Old records',
  WALK_IN: SOURCE_LABEL.WALK_IN, RSA: SOURCE_LABEL.RSA,
};
export const SERVICE_QUEUE_LABEL: Record<ServiceQueue, string> = {
  ASSESSMENT: 'Needs checking', MINOR_REPAIR: 'Small repair', MAJOR_REPAIR: 'Big repair',
  ACCIDENT: 'Accident', WARRANTY: 'Warranty claim', INSURANCE: 'Insurance claim',
  PARTS_WAITING: 'Waiting for parts', QC_PENDING: 'Quality Check', READY_TO_DEPLOY: 'Ready to Deploy',
};
export const LIABILITY_LABEL: Record<ServiceLiability, string> = {
  DEPOSIT: 'Take it from the deposit', RIDER: 'Rider pays', COMPANY: 'Company pays',
};
