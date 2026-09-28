package com.evrental.rider;

/**
 * How this rider settles their rent — the standing arrangement, not a receipt.
 *
 * <p>Same three values as PaymentMethod in frontend/app/src/types/payment.ts,
 * deliberately not a second enum: an agreed mode a collection can never be
 * recorded in would be a trap. A rider on UPI who hands over cash one week is
 * recorded as cash for that week and is still a UPI rider.
 */
public enum PaymentMode {
    UPI,
    CASH,
    BANK_TRANSFER
}