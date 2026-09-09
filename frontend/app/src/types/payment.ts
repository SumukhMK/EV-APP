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
  /** Shown on the list so a reminder can be a call, not a click-through. */
  phone: string;
  vehicleId: string;
  daysOverdue: number;
  amountDue: Paise;
  stage: DunningStage;
}

/**
 * What "record a payment" sends (screens 15 and 16). A collection is always
 * against one rider's current period; the amount is what actually came in, so
 * a partial payment is just an amount short of the balance.
 */
export interface RecordPaymentRequest {
  riderId: string;
  amount: Paise;
  method: PaymentMethod;
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

/**
 * A single rider's receipt for one billing period (screen 16).
 *
 * It is the `PaymentPeriodRow` from the run plus the three things a receipt
 * has to answer that the run does not: what was actually collected against it,
 * how, and when. Every rupee line here is one already carried on the run row —
 * a receipt restates the same calculation, it does not invent a new one — so
 * the total on the run and the total on the receipt can never disagree.
 */
export interface PaymentReceipt {
  /** Human receipt number, only meaningful once something has been paid. */
  receiptNo: string | null;
  riderId: string;
  riderName: string;
  vehicleId: string;
  periodStart: Iso8601;
  periodEnd: Iso8601;
  billingDay: BillingDay;
  planAmount: Paise;
  daysBilled: number;
  perDayAmount: Paise;
  billedAmount: Paise;
  serviceCharges: Paise;
  arrears: Paise;
  totalDue: Paise;
  amountPaid: Paise;
  /** totalDue − amountPaid; positive means still owed. */
  balance: Paise;
  status: PaymentStatus;
  /** null until money is collected. */
  method: PaymentMethod | null;
  paidOn: Iso8601 | null;
  /** UPI/bank reference, where the method carries one. */
  reference: string | null;
}
