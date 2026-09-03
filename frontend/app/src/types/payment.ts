import type { Iso8601, Paise } from './common';
import type { BillingDay } from './rider';

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING';

/** One rider's line in a weekly payment run (screen 15). */
export interface PaymentPeriodRow {
  riderId: string;
  riderName: string;
  vehicleId: string;
  planAmount: Paise;
  /** Days actually billed in the period — a mid-week deboard bills fewer. */
  daysBilled: number;
  perDayAmount: Paise;
  billedAmount: Paise;
  serviceCharges: Paise;
  arrears: Paise;
  totalDue: Paise;
  amountPaid: Paise;
  status: PaymentStatus;
}

export interface PaymentRun {
  periodStart: Iso8601;
  periodEnd: Iso8601;
  billingDay: BillingDay;
  rows: PaymentPeriodRow[];
}

export type DunningStage = 'REMINDER_DUE' | 'WARNING_1' | 'WARNING_2' | 'REPOSSESSION_DUE';

export interface OverdueRider {
  riderId: string;
  riderName: string;
  vehicleId: string;
  daysOverdue: number;
  amountDue: Paise;
  stage: DunningStage;
}
