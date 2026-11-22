package com.evrental.payment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * What "collect" sends, mirroring RecordPaymentRequest in
 * frontend/app/src/types/payment.ts.
 *
 * <p>{@code riderId} is the rider code an operator reads, such as "R01".
 * {@code amount} is what came in, in paise; more than is owed is kept as
 * credit. {@code method} is a String so an unknown value answers 422 naming
 * the field rather than Jackson's 400.
 *
 * <p>{@code clientKey} is made once per payment form by the screen. Sending
 * the same key twice — a double tap, or a retry on a slow network — returns
 * the first payment instead of saving a second.
 */
public record RecordPaymentRequest(
        @NotBlank String riderId,
        long amount,
        @NotNull String method,
        @Size(max = 100) String reference,
        @Size(max = 64) String clientKey) {
}
