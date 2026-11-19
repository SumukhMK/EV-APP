package com.evrental.payment;

import com.evrental.rider.BillingDay;
import java.time.LocalDate;

/**
 * One rider's current billing window, ending on their selected billing day.
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

    /** Current billing window ends the day before the next due day. */
    public static BillingPeriod current(BillingDay billingDay, LocalDate startedOn, LocalDate today) {
        LocalDate nextDue = endOnOrAfter(billingDay, today, true);
        LocalDate previousDue = nextDue.minusWeeks(1);
        LocalDate start = previousDue.isBefore(startedOn) ? startedOn : previousDue;
        LocalDate end = today.isBefore(nextDue) ? today : nextDue;
        if (end.isBefore(start)) end = start.minusDays(1);
        return new BillingPeriod(start, end, billingDay);
    }

    public static LocalDate endOnOrAfter(BillingDay billingDay, LocalDate date) {
        return endOnOrAfter(billingDay, date, false);
    }

    private static LocalDate endOnOrAfter(BillingDay billingDay, LocalDate date, boolean strictlyAfter) {
        int target = billingDay.ordinal() + 1;
        int forward = Math.floorMod(target - date.getDayOfWeek().getValue(), 7);
        if (strictlyAfter && forward == 0) forward = 7;
        return date.plusDays(forward);
    }

    /**
     * How many days of this period an assignment covered, inclusive.
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
        return (int) (last.toEpochDay() - first.toEpochDay() + 1);
    }

    public int lengthDays() {
        return (int) (end.toEpochDay() - start.toEpochDay() + 1);
    }
}
