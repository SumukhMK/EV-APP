import type {
  OverdueRider,
  PaymentPeriodRow,
  PaymentReceipt,
  PaymentRun,
  RecordPaymentRequest,
} from '../../types';
import { mondayRun, overdueRiders, paymentReceiptFor, recordPaymentInRun } from '../../mocks/payments';
import { delay } from './client';

export async function getCurrentPaymentRun(): Promise<PaymentRun> {
  return delay(mondayRun);
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
