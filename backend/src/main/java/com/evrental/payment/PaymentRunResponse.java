package com.evrental.payment;

import com.evrental.rider.BillingDay;
import java.time.LocalDate;
import java.util.List;

/**
 * One billing cycle's run for the current week (screen 15), mirroring
 * PaymentRun in frontend/app/src/types/payment.ts.
 *
 * <p>A run is <em>the riders in that cycle, one row each, no more and no
 * fewer</em>. A rider with no plan still gets a row, billing nothing: a run
 * that silently omits people is how somebody stops being billed by accident.
 */
public record PaymentRunResponse(
        LocalDate periodStart,
        LocalDate periodEnd,
        BillingDay billingDay,
        List<PaymentPeriodRowResponse> rows) {
}
