import type { DamageCategory, ServiceJobSource, ServiceLiability } from '../types';
import type { StatusTone } from '../theme/tokens';

export const CATEGORY_LABEL: Record<DamageCategory, string> = {
  NONE: 'None', MINOR: 'Minor', MAJOR: 'Major', ACCIDENT: 'Accident',
};
export const CATEGORY_TONE: Record<DamageCategory, StatusTone> = {
  NONE: 'neutral', MINOR: 'caution', MAJOR: 'warn', ACCIDENT: 'bad',
};
export const SOURCE_LABEL: Record<ServiceJobSource, string> = {
  DEBOARD: 'Deboard', RSA: 'Roadside assistance (RSA)', QRT: 'Quick response team (QRT)', WALK_IN: 'Walk-in',
};
export const LIABILITY_LABEL: Record<ServiceLiability, string> = {
  DEPOSIT: 'Deduct from deposit', RIDER: 'Charge the rider', COMPANY: 'Write off (company)',
};
