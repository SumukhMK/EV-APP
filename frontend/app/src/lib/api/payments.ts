import { IS_LIVE } from './client';
import * as live from './payments.live';
import * as mock from './payments.mock';

/**
 * Which payments module the screens get.
 *
 * S6's second half shipped a real API; this is the swap vehicles.ts already
 * does for S1. The choice is made here, once, from VITE_API_BASE, so no
 * screen — PaymentRun, OverdueRiders, PaymentReceipt, RecordPaymentDialog —
 * knows which implementation it got.
 *
 * The two implementations share a signature by construction — the compiler
 * checks it below, so a live function that drifts from its mock twin fails
 * the build rather than a screen.
 */

const impl: typeof mock = IS_LIVE ? { ...mock, ...live } : mock;

export const getCurrentPaymentRun = impl.getCurrentPaymentRun;
export const listOverdueRiders = impl.listOverdueRiders;
export const getPaymentReceipt = impl.getPaymentReceipt;
export const recordPayment = impl.recordPayment;
