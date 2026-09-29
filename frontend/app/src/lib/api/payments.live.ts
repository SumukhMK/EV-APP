import type {
  BillingDay,
  OverdueRider,
  PaymentPeriodRow,
  PaymentReceipt,
  PaymentRun,
  RecordPaymentRequest,
} from '../../types';
import { request } from './client';

/**
 * The payments module against the real API (S6, second half).
 *
 * Same shape as vehicles.live.ts: every function here is the same signature
 * as its twin in payments.mock.ts, and PaymentRunResponse /
 * OverdueRiderResponse / PaymentReceiptResponse / PaymentPeriodRowResponse
 * were written field-for-field against these types, so the JSON *is* the
 * type — no mapping layer.
 */

export function getCurrentPaymentRun(billingDay: BillingDay = 'MONDAY'): Promise<PaymentRun> {
  return request<PaymentRun>('/payments/runs/current', { query: { billingDay } });
}

export function listOverdueRiders(): Promise<OverdueRider[]> {
  return request<OverdueRider[]>('/payments/overdue');
}

/**
 * One rider's receipt for the current period.
 *
 * The API answers a rider with no line in this period as 200 with a JSON
 * `null` body, not a 404 — `request` hands that straight back as the
 * `PaymentReceipt | null` the screen already expects.
 */
export function getPaymentReceipt(riderId: string): Promise<PaymentReceipt | null> {
  return request<PaymentReceipt | null>(`/payments/receipts/${encodeURIComponent(riderId)}`);
}

export function recordPayment(req: RecordPaymentRequest): Promise<PaymentPeriodRow> {
  return request<PaymentPeriodRow>('/payments/collections', { method: 'POST', body: req });
}
