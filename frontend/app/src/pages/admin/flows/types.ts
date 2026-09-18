import type { StatusTone } from '../../../theme/tokens';
import type { UserRole } from '../../../types';

export type FlowMode = 'operational' | 'data' | 'rbac' | 'asis' | 'money';

export const FLOW_MODES: { id: FlowMode; label: string }[] = [
  { id: 'operational', label: 'How it works' },
  { id: 'data', label: 'What we store' },
  { id: 'rbac', label: 'Who can do what' },
  { id: 'asis', label: 'What changes' },
  { id: 'money', label: 'Where money flows' },
];

export interface FlowNodeData {
  label: string;
  description: string;
  tone: StatusTone;

  // Operational
  screens: { path: string; label: string }[];
  actors: UserRole[];
  actions: string[];
  triggers: string[];

  // Data model
  typeName: string;
  fields: { name: string; type: string; example: string }[];
  relatedTypes: string[];

  // RBAC
  permissions: Record<UserRole, { canView: boolean; canAct: boolean }>;
  permissionFn: string | null;

  // As-Is / To-Be
  asIs: 'exists' | 'dead' | 'problematic';
  toBe: 'unchanged' | 'removed' | 'added' | 'modified';
  changeNote: string;
  problems: string[];

  // Money (only on money-mode nodes)
  moneyDetail?: string;
}

export interface FlowEdgeData {
  trigger: string;
  actor: UserRole[];
  operation: string;
  modes: FlowMode[];
  asIs: 'exists' | 'bypass';
  toBe: 'unchanged' | 'removed' | 'added';
  changeNote: string;
}
