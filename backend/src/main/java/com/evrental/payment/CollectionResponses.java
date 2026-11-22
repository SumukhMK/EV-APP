package com.evrental.payment;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * What the money screens read, mirroring frontend/app/src/types/payment.ts.
 *
 * <p>Every amount is paise. {@code owes} is positive when the rider owes and
 * negative when they have paid ahead (credit).
 */
public final class CollectionResponses {

    private CollectionResponses() {}

    /** Collections: one row per rider who has a bike or still owes. */
    public record Collections(LocalDate today, long collectedToday, int paymentsToday, List<Row> rows) {}

    /**
     * @param dueBy    last day of the rider's current week — when this week's rent becomes late
     * @param weekRent rent for the current week so far
     */
    public record Row(String riderId, String riderName, String phone, String vehicleId, boolean active,
                      long owes, long daysLate, DunningStage stage, LocalDate dueBy, long weekRent,
                      PaymentMethod usualMethod, LastPayment lastPayment) {}

    public record LastPayment(long amount, PaymentMethod method, Instant at, String by) {}

    /** One payment or reversal — also the receipt. */
    public record Payment(UUID id, String receiptNo, String riderId, String riderName, String vehicleId,
                          long amount, PaymentMethod method, String reference, Instant at, String by,
                          Long owedBefore, Long owedAfter, UUID reversesId, String reason, boolean reversed) {}

    /** A rider's whole account: header figures and every line, newest first. */
    public record Account(String riderId, String riderName, String phone, String vehicleId, boolean active,
                          long planAmount, long depositHeld, PaymentMethod usualMethod,
                          long owes, long daysLate, LocalDate lateSince, DunningStage stage,
                          LocalDate rentFrom, long rent, long charges, long paid, List<Line> lines) {}

    /**
     * @param kind    RENT, CHARGE, PAYMENT or REVERSAL
     * @param amount  positive adds to what is owed, negative takes off
     * @param balance what was owed right after this line
     * @param to      last day a rent line covers
     * @param locked  a rent line whose week is billed and frozen; false while it is still running
     */
    public record Line(String kind, LocalDate date, Instant at, long amount, long balance,
                       LocalDate to, int days, boolean locked, String note,
                       UUID paymentId, String receiptNo, PaymentMethod method, String reference,
                       String by, String reason, boolean reversed) {}

    /** One day's money, for the end-of-day cash count. */
    public record Today(LocalDate date, long total, int count, List<StaffTotal> byStaff, List<Payment> payments) {}

    public record StaffTotal(String name, int count, long cash, long upi, long bank, long total) {}

    /** The late riders, as the dashboard counts them. */
    public record LateSummary(long riders, long value, long partlyPaid, long notPaid) {}
}
