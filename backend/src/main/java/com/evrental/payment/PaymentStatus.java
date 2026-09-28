package com.evrental.payment;

/**
 * Where one rider's week stands, matching PaymentStatus in
 * frontend/app/src/types/payment.ts.
 *
 * <p>Never frozen, unlike the rest of the row it sits on: it is a function of
 * what was billed, what has been collected and what day it is. See
 * {@link PaymentPeriod#recomputeStatus}.
 */
public enum PaymentStatus {
    /** Nothing collected, and the week is not over. */
    PENDING,
    /** Some money in, still short. */
    PARTIAL,
    /** Settled, or more than settled — a rider may pay ahead. */
    PAID,
    /** The week closed and the money is still short. */
    OVERDUE
}
