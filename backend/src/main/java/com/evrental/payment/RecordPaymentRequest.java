package com.evrental.payment;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * What "record a payment" sends (screens 15 and 16), mirroring
 * RecordPaymentRequest in frontend/app/src/types/payment.ts.
 *
 * <p>{@code amount} is what actually came in, so a partial payment is simply
 * an amount short of the balance and an overpayment is one past it. Both are
 * accepted: a rider paying ahead carries a credit, and refusing money at the
 * counter is worse than carrying one.
 *
 * <p>{@code method} is a String rather than the enum on purpose. Jackson
 * answers an unknown enum value with a 400 and a deserialisation message; the
 * contract wants a 422 naming the field, like every other rule in this module.
 * Parsing it in the service is what buys that.
 *
 * <p>{@code reference} is not in the frontend type. It is accepted because a
 * UPI or NEFT collection has one and a receipt is expected to print it, and it
 * is optional so the existing dialog keeps working unchanged.
 */
public record RecordPaymentRequest(
        @NotNull UUID riderId,
        long amount,
        @NotNull String method,
        String reference) {
}
