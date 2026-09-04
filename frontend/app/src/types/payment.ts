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

/**
 * One period on a single rider's ledger (screen 08's payment history panel).
 *
 * A thinner row than `PaymentPeriodRow`: the weekly run needs the whole
 * calculation because that is the screen where it is argued about, whereas the
 * rider's own history only has to answer "was this week settled, and how".
 */
export interface RiderPaymentRow {
  id: string;
  periodStart: Iso8601;
  periodEnd: Iso8601;
  totalDue: Paise;
  amountPaid: Paise;
  status: PaymentStatus;
  /** null while nothing has been collected against the period. */
  method: PaymentMethod | null;
}

export type PaymentMethod = 'UPI' | 'CASH' | 'BANK_TRANSFER';
