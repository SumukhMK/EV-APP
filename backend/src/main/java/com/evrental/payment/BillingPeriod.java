package com.evrental.payment;

import com.evrental.rider.BillingDay;
import java.time.LocalDate;

/**
 * One week of billing: the day it opens, the day it closes, and which of
 * Ashok's two cycles it belongs to.
 *
 * <p>Not persisted — {@code payment_periods} stores the same three columns per
 * rider. This exists so the "which week is it?" arithmetic is written once.
 *
 * <p>Neither the run nor the receipt endpoint takes a period: the frontend
 * contract's functions do not have one, so both mean <em>current</em>, which
 * is resolved here as the most recent occurrence of the billing day on or
 * before today. Older periods are reachable through the rider's history panel.
 */
public record BillingPeriod(LocalDate start, LocalDate end, BillingDay billingDay) {

    /** Seven days inclusive: Monday opens, the following Sunday closes. */
    private static final int LENGTH_DAYS = 7;

    public static BillingPeriod current(BillingDay billingDay, LocalDate today) {
        LocalDate start = startOnOrBefore(billingDay, today);
        return new BillingPeriod(start, start.plusDays(LENGTH_DAYS - 1L), billingDay);
    }

    /**
     * The most recent occurrence of {@code billingDay} on or before
     * {@code date} — the period a thing happening on that date falls into.
     *
     * <p>Used for two jobs that must agree: resolving the current run, and
     * stamping a charge with the period it should first appear against. If
     * they disagreed, a charge raised on the Monday it was billed would land
     * in the following week's arrears.
     */
    public static LocalDate startOnOrBefore(BillingDay billingDay, LocalDate date) {
        int target = isoDayOf(billingDay);
        int back = Math.floorMod(date.getDayOfWeek().getValue() - target, LENGTH_DAYS);
        return date.minusDays(back);
    }

    /** ISO-8601 day numbering, the same mapping V009's backfill uses. */
    private static int isoDayOf(BillingDay billingDay) {
        return billingDay == BillingDay.MONDAY ? 1 : 3;
    }

    /**
     * How many days of this period an assignment covered, clamped to 0..7.
     *
     * @param startedOn when the rider took the bike
     * @param endedOn   when they handed it back, or null while it is open
     */
    public int overlapDays(LocalDate startedOn, LocalDate endedOn) {
        LocalDate first = startedOn.isAfter(start) ? startedOn : start;
        LocalDate last = endedOn != null && endedOn.isBefore(end) ? endedOn : end;
        if (first.isAfter(last)) {
            return 0;
        }
        return (int) Math.min(LENGTH_DAYS, last.toEpochDay() - first.toEpochDay() + 1);
    }

    public int lengthDays() {
        return LENGTH_DAYS;
    }
}
