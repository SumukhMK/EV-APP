import type {
  BillingDay,
  OverdueRider,
  PaymentPeriodRow,
  PaymentReceipt,
  PaymentRun,
  RecordPaymentRequest,
} from '../../types';
import { overdueRiders, paymentReceiptFor, recordPaymentInRun, runsByDay } from '../../mocks/payments';
import { delay } from './client';

/** The run for one billing cycle. Both cycles are real; the screen picks one. */
export async function getCurrentPaymentRun(billingDay: BillingDay = 'MONDAY'): Promise<PaymentRun> {
  return delay(runsByDay[billingDay]);
}

export async function listOverdueRiders(): Promise<OverdueRider[]> {
  return delay(overdueRiders);
}

/** One rider's receipt for the current period. null if they have no line in it. */
export async function getPaymentReceipt(riderId: string): Promise<PaymentReceipt | null> {
  return delay(paymentReceiptFor(riderId));
}

/** Record a collection against the current run. Simulated write; see the mock. */
export async function recordPayment(req: RecordPaymentRequest): Promise<PaymentPeriodRow> {
  return delay(recordPaymentInRun(req.riderId, req.amount, req.method));
}
