import type { RepairType, ServiceJobItem } from '../../../types';

/** A line as typed: the cost stays text until it is sent. */
export interface CostLine { label: string; cost: string; kind: 'PART' | 'LABOUR' | 'OTHER' }

export const MONEY = /^\d+(\.\d{1,2})?$/;

export const toLines = (items: ServiceJobItem[]): CostLine[] =>
  items.map((item) => ({ label: item.label, cost: (item.costPaise / 100).toFixed(2), kind: item.kind ?? 'PART' }));

export const toItems = (lines: CostLine[]): ServiceJobItem[] =>
  lines.map((line) => ({ label: line.label.trim(), costPaise: Math.round(Number(line.cost) * 100), kind: line.kind }));

export const linesValid = (lines: CostLine[]) =>
  lines.every((line) => line.label.trim() && MONEY.test(line.cost) && Number.isSafeInteger(Math.round(Number(line.cost) * 100)));

/** The repair type follows from what was listed, so nobody has to pick it. */
export function repairTypeOf(lines: CostLine[]): RepairType {
  const parts = lines.some((l) => l.kind === 'PART');
  const labour = lines.some((l) => l.kind !== 'PART');
  return parts && labour ? 'REPAIR_AND_SPARE_PARTS' : parts ? 'SPARE_PARTS' : 'REPAIR_ONLY';
}
