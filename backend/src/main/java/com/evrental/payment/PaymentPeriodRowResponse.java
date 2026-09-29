package com.evrental.payment;

import java.util.UUID;

/**
 * One rider's line in a weekly payment run (screen 15), mirroring
 * PaymentPeriodRow in frontend/app/src/types/payment.ts field for field.
 *
 * <p>Every rupee figure here is read straight off the frozen
 * {@link PaymentPeriod} — none of it is recomputed at read time. That is the
 * property the whole design exists to protect: a receipt printed six weeks ago
 * shows the plan the rider was actually on, not the one they are on now.
 *
 * <p>{@code vehicleId} is the registry id an operator reads ("BLRSS0428"), not
 * a row id, and it is <b>null until S5</b>: a bike is a property of the open
 * assignment and {@code assignment/} is not built. See {@link AssignmentQuery}.
 */
public record PaymentPeriodRowResponse(
        UUID riderId,
        String riderName,
        String vehicleId,
        long planAmount,
        int daysBilled,
        long perDayAmount,
        long billedAmount,
        long serviceCharges,
        long arrears,
        long totalDue,
        long amountPaid,
        PaymentStatus status) {

    public static PaymentPeriodRowResponse from(PaymentPeriod period, String riderName, String registryId) {
        return new PaymentPeriodRowResponse(
                period.getRiderId(),
                riderName,
                registryId,
                period.getPlanAmountPaise(),
                period.getDaysBilled(),
                period.getPerDayAmountPaise(),
                period.getBilledAmountPaise(),
                period.getServiceChargesPaise(),
                period.getArrearsPaise(),
                period.getTotalDuePaise(),
                period.getAmountPaidPaise(),
                period.getStatus());
    }
}
