package com.evrental.payment;

import java.time.LocalDate;

/**
 * One period on a single rider's ledger (screen 08's payment history panel),
 * mirroring RiderPaymentRow in frontend/app/src/types/payment.ts field for
 * field.
 *
 * <p>Thinner than the weekly run's row: the run is where the calculation is
 * argued about; a rider's own history only has to answer "was this week
 * settled, and how".
 *
 * <p>status and method are String until S6's second half computes real
 * periods — nothing in S2 produces a value, so there is no enum to type them
 * with yet. method is null while nothing has been collected against the
 * period.
 */
public record RiderPaymentRow(
        String id,
        LocalDate periodStart,
        LocalDate periodEnd,
        long totalDue,
        long amountPaid,
        String status,
        String method) {}