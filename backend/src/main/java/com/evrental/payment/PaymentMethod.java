package com.evrental.payment;

/**
 * How money came in, matching PaymentMethod in
 * frontend/app/src/types/payment.ts.
 *
 * <p>Deliberately not reusing {@code rider.PaymentMode}, which carries the
 * same three values: that one is the rider's standing arrangement, this one is
 * what a single collection actually was. A rider on UPI who hands over cash
 * once must not have their register entry rewritten by a receipt.
 */
public enum PaymentMethod {
    UPI,
    CASH,
    BANK_TRANSFER
}
