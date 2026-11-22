import { request } from './client';
import type { Collections, Payment, RecordPaymentRequest, RiderAccount, TodayCollections } from '../../types';

/**
 * The money API. Every type here was written field for field against
 * backend payment/CollectionResponses.java, so the JSON is the type.
 */

export function getCollections(): Promise<Collections> {
  return request<Collections>('/payments/collections');
}

export function getRiderAccount(riderId: string): Promise<RiderAccount> {
  return request<RiderAccount>(`/payments/riders/${encodeURIComponent(riderId)}/account`);
}

export function recordPayment(req: RecordPaymentRequest): Promise<Payment> {
  return request<Payment>('/payments/collections', { method: 'POST', body: req });
}

export function reversePayment(paymentId: string, reason: string): Promise<Payment> {
  return request<Payment>(`/payments/collections/${encodeURIComponent(paymentId)}/reverse`, {
    method: 'POST',
    body: { reason },
  });
}

export function getPayment(paymentId: string): Promise<Payment> {
  return request<Payment>(`/payments/collections/${encodeURIComponent(paymentId)}`);
}

export function getTodayCollections(date?: string): Promise<TodayCollections> {
  return request<TodayCollections>(`/payments/today${date ? `?date=${encodeURIComponent(date)}` : ''}`);
}
