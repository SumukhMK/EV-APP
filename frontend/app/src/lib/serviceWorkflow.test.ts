import { describe, expect, it } from 'vitest';
import { categoryOf, jobStage, walkInRiderCharge } from './serviceWorkflow';
import type { ServiceJobItem } from '../types';

/**
 * The three rules the two boards are built on. They are pure functions on
 * purpose: which board owns a job, what stage a hub job has reached, and what
 * a walk-in rider actually owes are decisions that must read the same way on
 * the board, on the job screen and in the mock server.
 */
describe('categoryOf', () => {
  it('sends a bike the rider still holds to the walk-in board', () => {
    expect(categoryOf('WALK_IN')).toBe('WALK_IN_RSA');
    expect(categoryOf('RSA')).toBe('WALK_IN_RSA');
  });

  it('sends everything else to the hub, including a recovery', () => {
    for (const source of ['DEBOARD', 'EXCHANGE', 'QRT', 'INSPECTION', 'REGISTRY', 'RECOVERY'] as const) {
      expect(categoryOf(source), source).toBe('HUB');
    }
  });
});

describe('jobStage', () => {
  it.each([
    ['MINOR_REPAIR', 'OPEN', 'UNDER_REPAIR'],
    ['ASSESSMENT', 'IN_PROGRESS', 'UNDER_REPAIR'],
    ['ACCIDENT', 'OPEN', 'UNDER_REPAIR'],
    ['PARTS_WAITING', 'OPEN', 'PARTS_WAITING'],
    ['QC_PENDING', 'IN_PROGRESS', 'QC_PENDING'],
    ['READY_TO_DEPLOY', 'CLOSED', 'CLOSED'],
  ] as const)('reads %s / %s as %s', (queue, status, stage) => {
    expect(jobStage({ queue, status })).toBe(stage);
  });

  it('calls a job closed in a repair queue closed, not under repair', () => {
    expect(jobStage({ queue: 'MINOR_REPAIR', status: 'CLOSED' })).toBe('CLOSED');
  });
});

describe('walkInRiderCharge', () => {
  const items: ServiceJobItem[] = [
    { label: 'Brake pads', costPaise: 50000, kind: 'PART' },
    { label: 'Fitting', costPaise: 30000, kind: 'LABOUR' },
  ];

  it('charges the spare parts the rider has not paid for, never the labour', () => {
    expect(walkInRiderCharge(items, 0)).toBe(50000);
    expect(walkInRiderCharge(items, 20000)).toBe(30000);
  });

  it('charges nothing once the parts are paid for, and never goes negative', () => {
    expect(walkInRiderCharge(items, 50000)).toBe(0);
    expect(walkInRiderCharge(items, 90000)).toBe(0);
  });

  it('charges nothing for a job with no parts at all', () => {
    expect(walkInRiderCharge([{ label: 'Diagnosis', costPaise: 25000, kind: 'LABOUR' }], 0)).toBe(0);
  });
});
