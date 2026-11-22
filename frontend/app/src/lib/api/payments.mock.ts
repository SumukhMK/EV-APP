import type { Collections, Payment, RecordPaymentRequest, RiderAccount, TodayCollections } from '../../types';
import * as ledger from '../../mocks/payments';
import { ApiError, delay } from './client';

/** Demo mode: the same calls against an in-memory ledger shaped like the API's. */

export async function getCollections(): Promise<Collections> {
  return delay(ledger.collections());
}

export async function getRiderAccount(riderId: string): Promise<RiderAccount> {
  const account = ledger.riderAccount(riderId);
  if (!account) throw new ApiError(`No rider with id ${riderId}`, 404);
  return delay(account);
}

export async function recordPayment(req: RecordPaymentRequest): Promise<Payment> {
  return delay(ledger.recordPayment(req));
}

export async function reversePayment(paymentId: string, reason: string): Promise<Payment> {
  return delay(ledger.reversePayment(paymentId, reason));
}

export async function getPayment(paymentId: string): Promise<Payment> {
  const payment = ledger.paymentById(paymentId);
  if (!payment) throw new Error('No such payment');
  return delay(payment);
}

export async function getTodayCollections(date?: string): Promise<TodayCollections> {
  return delay(ledger.todayCollections(date ?? new Date().toISOString().slice(0, 10)));
}
