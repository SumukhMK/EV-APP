package com.evrental.payment;

/**
 * Where a charge is in its life, matching RiderChargeStatus in
 * frontend/app/src/types/payment.ts.
 *
 * <p>Only two, because a charge is not a workflow: it is owed, or it is not.
 */
public enum RiderChargeStatus {
    /** Owed. Appears on the next run, or carries forward as arrears. */
    OPEN,
    /** Paid, or drawn from the deposit. Never reopened — a correction is a new row. */
    SETTLED
}
