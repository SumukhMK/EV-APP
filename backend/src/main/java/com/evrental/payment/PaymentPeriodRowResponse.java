package com.evrental.payment;

/**
 * One rider's line in a weekly payment run (screen 15), mirroring
 * PaymentPeriodRow in frontend/app/src/types/payment.ts field for field.
 *
 * <p>Every rupee figure here is read straight off the frozen
 * {@link PaymentPeriod} — none of it is recomputed at read time. That is the
 * property the whole design exists to protect: a receipt printed six weeks ago
 * shows the plan the rider was actually on, not the one they are on now.
 *
 * <p>{@code riderId} is the rider code an operator reads ("R01"), not the
 * register's internal row id. {@code vehicleId} is the registry id an
 * operator reads ("BLRSS0428"), not a row id, and it is <b>null until S5</b>:
 * a bike is a property of the open assignment and {@code assignment/} is not
 * built. See {@link AssignmentQuery}.
 */
public record PaymentPeriodRowResponse(
        String riderId,
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
        PaymentStatus status,
        /**
         * Days since the week closed, zero while it is still running.
         *
         * <p>The run used to show a status chip and nothing else, so a rider
         * one day late and a rider three weeks late looked identical on the
         * screen the chasing is done from.
         */
        long daysOverdue,
        /**
         * Past the operator's buffer and still short.
         *
         * <p>A verdict, not a duration, because the threshold is a business
         * rule and belongs in one place rather than in every screen that
         * compares a number to three.
         */
        boolean pastGrace) {

    public static PaymentPeriodRowResponse from(PaymentPeriod period, String riderCode, String riderName,
                                                String registryId, java.time.LocalDate today, int graceDays) {
        long daysOverdue = period.daysOverdue(today);
        boolean short_ = period.getAmountPaidPaise() < period.getTotalDuePaise();
        return new PaymentPeriodRowResponse(
                riderCode,
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
                period.getStatus(),
                daysOverdue,
                short_ && daysOverdue > graceDays);
    }
}
