package com.evrental.payment;

import com.evrental.rider.BillingDay;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One rider's receipt for one billing period (screen 16), mirroring
 * PaymentReceipt in frontend/app/src/types/payment.ts.
 *
 * <p>It is the run row plus the three things a receipt has to answer that the
 * run does not: what was collected, how, and when. Every rupee line is read
 * off the same frozen {@link PaymentPeriod} the run row reads, so the total on
 * the run and the total on the receipt can never disagree — that invariant is
 * the reason the period is stored rather than derived.
 *
 * <p>{@code method} and {@code paidOn} come from the most recent collection,
 * because that is what a counter receipt is showing: the payment just taken.
 * Earlier collections against the same week are still on the ledger and still
 * counted in {@code amountPaid}.
 */
public record PaymentReceiptResponse(
        String receiptNo,
        UUID riderId,
        String riderName,
        String vehicleId,
        LocalDate periodStart,
        LocalDate periodEnd,
        BillingDay billingDay,
        long planAmount,
        int daysBilled,
        long perDayAmount,
        long billedAmount,
        long serviceCharges,
        long arrears,
        long totalDue,
        long amountPaid,
        long balance,
        PaymentStatus status,
        PaymentMethod method,
        Instant paidOn,
        String reference) {

    public static PaymentReceiptResponse from(PaymentPeriod period, String riderName, String registryId,
                                              PaymentCollection latest) {
        return new PaymentReceiptResponse(
                period.getReceiptNo(),
                period.getRiderId(),
                riderName,
                registryId,
                period.getPeriodStart(),
                period.getPeriodEnd(),
                period.getBillingDay(),
                period.getPlanAmountPaise(),
                period.getDaysBilled(),
                period.getPerDayAmountPaise(),
                period.getBilledAmountPaise(),
                period.getServiceChargesPaise(),
                period.getArrearsPaise(),
                period.getTotalDuePaise(),
                period.getAmountPaidPaise(),
                period.balancePaise(),
                period.getStatus(),
                latest == null ? null : latest.getMethod(),
                latest == null ? null : latest.getCollectedOn(),
                latest == null ? null : latest.getReference());
    }
}
