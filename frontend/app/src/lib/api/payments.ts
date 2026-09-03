import type { OverdueRider, PaymentRun } from '../../types';
import { mondayRun, overdueRiders } from '../../mocks/payments';
import { delay } from './client';

export async function getCurrentPaymentRun(): Promise<PaymentRun> {
  return delay(mondayRun);
}

export async function listOverdueRiders(): Promise<OverdueRider[]> {
  return delay(overdueRiders);
}
