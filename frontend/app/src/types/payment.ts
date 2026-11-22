import type { Iso8601, Paise } from './common';
import type { ServiceLiability } from './serviceJob';

/**
 * Money, mirroring backend payment/CollectionResponses.java.
 *
 * One number per rider: `owes` — rent + charges − payments, worked out on the
 * server and nowhere else. Positive is owed; negative is credit (paid ahead).
 */

/** The register's chip. Derived from the same account as `owes`. */
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'PENDING';

export type DunningStage = 'REMINDER_DUE' | 'WARNING_1' | 'WARNING_2' | 'REPOSSESSION_DUE';

export type PaymentMethod = 'UPI' | 'CASH' | 'BANK_TRANSFER';

export interface LastPayment {
  amount: Paise;
  method: PaymentMethod;
  at: Iso8601;
  /** Who took it; null when unknown. */
  by: string | null;
}

/** One rider on the Collections page. */
export interface CollectionRow {
  riderId: string;
  riderName: string;
  phone: string;
  /** The bike they hold now; null after a deboard. */
  vehicleId: string | null;
  active: boolean;
  owes: Paise;
  /** 0 when nothing is late. */
  daysLate: number;
  /** Next step for a late rider; null when not late. */
  stage: DunningStage | null;
  /** Last day of the current week: this week's rent is late after it. */
  dueBy: Iso8601 | null;
  /** Rent for the current week so far. */
  weekRent: Paise;
  /** How this rider normally pays — the collect form starts on it. */
  usualMethod: PaymentMethod;
  lastPayment: LastPayment | null;
}

export interface Collections {
  today: Iso8601;
  /** Net of reversals. */
  collectedToday: Paise;
  paymentsToday: number;
  rows: CollectionRow[];
}

export interface RecordPaymentRequest {
  riderId: string;
  amount: Paise;
  method: PaymentMethod;
  reference?: string;
  /** Made once per collect form, so a double tap or retry saves one payment. */
  clientKey?: string;
}

/** One payment or reversal — also its receipt. */
export interface Payment {
  id: string;
  receiptNo: string | null;
  riderId: string;
  riderName: string;
  vehicleId: string | null;
  /** Positive for a payment, negative for a reversal. */
  amount: Paise;
  method: PaymentMethod;
  reference: string | null;
  at: Iso8601;
  by: string | null;
  /** null on payments recorded before the switch to one row per payment. */
  owedBefore: Paise | null;
  owedAfter: Paise | null;
  /** Set on a reversal: the payment it takes back. */
  reversesId: string | null;
  reason: string | null;
  /** A payment that has since been reversed. */
  reversed: boolean;
}

export type AccountLineKind = 'RENT' | 'CHARGE' | 'PAYMENT' | 'REVERSAL';

export interface AccountLine {
  kind: AccountLineKind;
  date: Iso8601;
  at: Iso8601;
  /** Positive adds to what is owed; negative takes off. */
  amount: Paise;
  /** What was owed right after this line. */
  balance: Paise;
  /** Rent: last day covered. */
  to: Iso8601 | null;
  /** Rent: days covered. */
  days: number;
  /** Rent: the week is billed and frozen; false while it is still running. */
  locked: boolean;
  /** Charge: what it was for. */
  note: string | null;
  paymentId: string | null;
  receiptNo: string | null;
  method: PaymentMethod | null;
  reference: string | null;
  by: string | null;
  reason: string | null;
  reversed: boolean;
}

/** A rider's whole account, lines newest first. */
export interface RiderAccount {
  riderId: string;
  riderName: string;
  phone: string;
  vehicleId: string | null;
  active: boolean;
  planAmount: Paise;
  depositHeld: Paise;
  usualMethod: PaymentMethod;
  owes: Paise;
  daysLate: number;
  /** Last day of the oldest unpaid week; null when nothing is late. */
  lateSince: Iso8601 | null;
  stage: DunningStage | null;
  /** First day of rent in this account; null when the rider holds no bike. */
  rentFrom: Iso8601 | null;
  rent: Paise;
  charges: Paise;
  paid: Paise;
  lines: AccountLine[];
}

export interface StaffTotal {
  name: string;
  count: number;
  cash: Paise;
  upi: Paise;
  bank: Paise;
  total: Paise;
}

/** One day's money, for the end-of-day cash count. */
export interface TodayCollections {
  date: Iso8601;
  total: Paise;
  count: number;
  byStaff: StaffTotal[];
  /** Newest first, reversals included. */
  payments: Payment[];
}

export type RiderChargeStatus = 'OPEN' | 'SETTLED';

export interface RiderCharge {
  id: string;
  riderId: string;
  serviceJobId: string;
  vehicleId: string;
  amount: Paise;
  liability: ServiceLiability;
  status: RiderChargeStatus;
  /** The billing week this charge was raised in. */
  periodStart: Iso8601;
  createdOn: Iso8601;
}
