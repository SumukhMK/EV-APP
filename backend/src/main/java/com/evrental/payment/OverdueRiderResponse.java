package com.evrental.payment;

import java.util.UUID;

/**
 * A rider who is behind (screen 17), mirroring OverdueRider in
 * frontend/app/src/types/payment.ts.
 *
 * <p>{@code phone} is on the list so a reminder can be a call rather than a
 * click-through — the screen's own CTAs stay mock until the notification
 * module exists.
 *
 * <p>{@code daysOverdue} counts from {@code periodEnd}, the day that week's
 * money was actually due, and {@code stage} is a pure function of it. Nothing
 * records that a reminder was sent, because nothing can send one yet.
 */
public record OverdueRiderResponse(
        UUID riderId,
        String riderName,
        String phone,
        String vehicleId,
        long daysOverdue,
        long amountDue,
        DunningStage stage) {
}
