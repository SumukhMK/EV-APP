package com.evrental.payment;

import java.time.LocalDate;
import java.util.UUID;

/**
 * One period on a single rider's ledger (screen 08's payment history panel),
 * mirroring RiderPaymentRow in frontend/app/src/types/payment.ts field for
 * field.
 *
 * <p>Thinner than the weekly run's row: the run is where the calculation is
 * argued about; a rider's own history only has to answer "was this week
 * settled, and how".
 *
 * <p>status and method were String while nothing produced a value to type
 * them with. S6's second half does, so both carry their enums now.
 * {@code method} is the most recent collection's, and null while nothing has
 * been collected against the period.
 */
public record RiderPaymentRow(
        UUID id,
        LocalDate periodStart,
        LocalDate periodEnd,
        long totalDue,
        long amountPaid,
        PaymentStatus status,
        PaymentMethod method) {}
