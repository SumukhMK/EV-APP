import type { DamageCategory, ServiceJobSource, ServiceLiability, ServiceQueue } from '../types';
import type { StatusTone } from '../theme/tokens';

export const CATEGORY_LABEL: Record<DamageCategory, string> = {
  NONE: 'No damage', MINOR: 'Small damage', MAJOR: 'Big damage', ACCIDENT: 'Accident',
};
export const CATEGORY_TONE: Record<DamageCategory, StatusTone> = {
  NONE: 'neutral', MINOR: 'caution', MAJOR: 'warn', ACCIDENT: 'bad',
};
export const SOURCE_LABEL: Record<ServiceJobSource, string> = {
  DEBOARD: 'Rider gave the bike back', RSA: 'Roadside help (RSA)', QRT: 'Rescue team (QRT)', WALK_IN: 'Rider came to the hub',
  EXCHANGE: 'Bike swap', INSPECTION: 'Routine check', REGISTRY: 'Older record',
};
export const SERVICE_QUEUE_LABEL: Record<ServiceQueue, string> = {
  ASSESSMENT: 'Needs checking', MINOR_REPAIR: 'Small repair', MAJOR_REPAIR: 'Big repair',
  ACCIDENT: 'Accident', WARRANTY: 'Warranty claim', INSURANCE: 'Insurance claim',
  PARTS_WAITING: 'Waiting for parts', QC_PENDING: 'Quality Check', READY_TO_DEPLOY: 'Ready to Deploy',
};
export const LIABILITY_LABEL: Record<ServiceLiability, string> = {
  DEPOSIT: 'Take it from the deposit', RIDER: 'Rider pays', COMPANY: 'Company pays',
};
