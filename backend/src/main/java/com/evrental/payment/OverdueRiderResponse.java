package com.evrental.payment;

/**
 * A rider who is behind (screen 17), mirroring OverdueRider in
 * frontend/app/src/types/payment.ts.
 *
 * <p>{@code phone} is on the list so a reminder can be a call rather than a
 * click-through — the screen's own CTAs stay mock until the notification
 * module exists.
 *
 * <p>{@code riderId} is the rider code an operator reads ("R01"), not the
 * register's internal row id — the same split {@code vehicleId} already has
 * with the registry id.
 *
 * <p>{@code daysOverdue} counts from {@code periodEnd}, the day that week's
 * money was actually due, and {@code stage} is a pure function of it. Nothing
 * records that a reminder was sent, because nothing can send one yet.
 */
public record OverdueRiderResponse(
        String riderId,
        String riderName,
        String phone,
        String vehicleId,
        long daysOverdue,
        long amountDue,
        DunningStage stage,
        /** Past the operator's buffer. See PaymentPeriodRowResponse. */
        boolean pastGrace) {
}
