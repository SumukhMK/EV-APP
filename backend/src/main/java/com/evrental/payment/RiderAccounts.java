package com.evrental.payment;

import com.evrental.assignment.AssignmentQuery;
import com.evrental.rider.Rider;
import com.evrental.service.ServiceLiability;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * What a rider owes, worked out one way for every screen.
 *
 * <p>The run, the receipt, the overdue list, the rider register's dues and the
 * dashboard tiles all read this. Before, the run accrued rent day by day while
 * the others summed stored weekly rows — rows that only exist for weeks in
 * which somebody opened the run — so the same rider could be "settled" on one
 * screen and two weeks overdue on the next.
 *
 * <p>The account covers the rider's current tenancy — their unbroken run of
 * bikes ({@link AssignmentQuery#billingStartedOn}). Rent is each billed week's
 * frozen amount, plus the plan rate for days no week covers; rider-liable
 * charges raised in the tenancy (and older ones still open) are added; what
 * was paid against the weeks is taken off.
 */
@Component
public class RiderAccounts {

    private static final ServiceLiability BILLABLE = ServiceLiability.RIDER;

    private final AssignmentQuery assignments;
    private final RiderChargeRepository charges;
    private final PaymentPeriodRepository periods;

    public RiderAccounts(AssignmentQuery assignments, RiderChargeRepository charges,
                         PaymentPeriodRepository periods) {
        this.assignments = assignments;
        this.charges = charges;
        this.periods = periods;
    }

    /**
     * One rider's account as of {@code today}, split around the current
     * billing period the way the run reads it.
     *
     * @param since       first day of rent; null when the rider holds no bike
     * @param carried     owed when the period opened; negative is credit
     * @param daysOverdue days since the end of the oldest week whose rent is unpaid
     */
    public record Account(
            LocalDate since,
            BillingPeriod period,
            long perDay,
            int periodDays,
            long periodRent,
            long periodCharges,
            long carried,
            long periodPaid,
            long daysOverdue) {

        public long totalDue() {
            return periodRent + periodCharges + carried;
        }

        /** Positive is still owed; negative is credit. */
        public long balance() {
            return totalDue() - periodPaid;
        }

        public long owed() {
            return Math.max(0, balance());
        }

        public PaymentStatus status() {
            if (owed() == 0) return PaymentStatus.PAID;
            if (daysOverdue > 0) return PaymentStatus.OVERDUE;
            if (periodPaid > 0) return PaymentStatus.PARTIAL;
            return PaymentStatus.PENDING;
        }
    }

    @Transactional(readOnly = true)
    public Account of(Rider rider, LocalDate today) {
        LocalDate since = assignments.billingStartedOn(rider.getId()).orElse(null);
        BillingPeriod period = BillingPeriod.current(rider.getBillingDay(),
                since != null ? since : rider.getOnboardedOn(), today);
        long plan = rider.getPlanAmountPaise();
        long perDay = Math.round(plan / 7.0);

        List<Segment> segments = since == null ? List.of() : segments(rider, since, period, today, plan, perDay);
        long rentBefore = 0, periodRent = 0, paidBefore = 0, periodPaid = 0;
        int periodDays = 0;
        for (Segment seg : segments) {
            if (seg.start().isBefore(period.start())) {
                rentBefore += seg.rent();
                paidBefore += seg.paid();
            } else {
                periodRent += seg.rent();
                periodPaid += seg.paid();
                periodDays += seg.days();
            }
        }

        long chargesBefore = 0;
        long periodCharges = 0;
        for (RiderCharge charge : charges.findByRiderIdOrderByChargedOnDesc(rider.getId())) {
            if (charge.getLiability() != BILLABLE || !counts(charge, since)) continue;
            if (weekOf(charge).isBefore(period.start())) chargesBefore += charge.getAmountPaise();
            else periodCharges += charge.getAmountPaise();
        }

        long daysOverdue = daysOverdue(segments, paidBefore + periodPaid, rider, plan, perDay, today);
        return new Account(since, period, perDay, periodDays, periodRent,
                periodCharges, rentBefore + chargesBefore - paidBefore, periodPaid, daysOverdue);
    }

    /**
     * A stretch of the tenancy and its rent: a billed week (frozen amount,
     * what was paid against it) or days no week covers (plan rate, nothing paid).
     */
    record Segment(LocalDate start, LocalDate end, long rent, int days, long paid, boolean billed) {}

    /**
     * The tenancy from the first billed week to today, in order. Weeks the
     * run never opened for — and the rest of a week whose bill was frozen
     * part-way through — have no row, and are charged at the plan rate so no
     * day goes unbilled. Gaps are split at the current period's start so the
     * run can say what is this week's and what was carried in.
     *
     * <p>Rent before the first billed week predates this system and is taken
     * as settled outside it. shortcut: assumes that; replace with an explicit
     * opening balance per rider at go-live if it stops being true.
     */
    private List<Segment> segments(Rider rider, LocalDate since, BillingPeriod period, LocalDate today,
                                   long plan, long perDay) {
        List<PaymentPeriod> rows = periods.findByRiderIdOrderByPeriodStartDesc(rider.getId()).stream()
                .filter(p -> !p.getPeriodEnd().isBefore(since) && !p.getPeriodStart().isAfter(today))
                .sorted(Comparator.comparing(PaymentPeriod::getPeriodStart))
                .toList();
        LocalDate rentFrom = rows.isEmpty() ? period.start() : rows.get(0).getPeriodStart();
        if (rentFrom.isBefore(since)) rentFrom = since;

        List<Segment> out = new ArrayList<>();
        LocalDate cursor = rentFrom;
        for (PaymentPeriod row : rows) {
            if (row.getPeriodStart().isAfter(cursor)) {
                gap(out, cursor, row.getPeriodStart().minusDays(1), period.start(), plan, perDay);
            }
            out.add(new Segment(row.getPeriodStart(), row.getPeriodEnd(), row.getBilledAmountPaise(),
                    row.getDaysBilled(), row.getAmountPaidPaise(), true));
            if (!row.getPeriodEnd().isBefore(cursor)) cursor = row.getPeriodEnd().plusDays(1);
        }
        gap(out, cursor, today, period.start(), plan, perDay);
        return out;
    }

    private static void gap(List<Segment> out, LocalDate from, LocalDate to, LocalDate split,
                            long plan, long perDay) {
        if (from.isAfter(to)) return;
        if (from.isBefore(split) && !to.isBefore(split)) {
            gap(out, from, split.minusDays(1), split, plan, perDay);
            gap(out, split, to, split, plan, perDay);
            return;
        }
        int n = days(from, to);
        // No plan, nothing billed — the same zero-day line a frozen week shows.
        out.add(new Segment(from, to, rent(plan, perDay, n), plan == 0 ? 0 : n, 0, false));
    }

    /**
     * Days since the end of the oldest week whose rent is not covered, paying
     * rent oldest first. A billed week ends where its row says; days without
     * a row end with their billing week.
     */
    private static long daysOverdue(List<Segment> segments, long paid, Rider rider, long plan, long perDay,
                                    LocalDate today) {
        long remaining = paid;
        for (Segment seg : segments) {
            if (remaining >= seg.rent()) {
                remaining -= seg.rent();
                continue;
            }
            LocalDate weekEnd;
            if (seg.billed()) {
                weekEnd = seg.end();
            } else {
                LocalDate firstUnpaid = seg.start().plusDays(coveredDays(plan, perDay, remaining, seg.days()));
                weekEnd = BillingPeriod.endOnOrAfter(rider.getBillingDay(), firstUnpaid.plusDays(1)).minusDays(1);
            }
            return Math.max(0, today.toEpochDay() - weekEnd.toEpochDay());
        }
        return 0;
    }

    /**
     * Open charges, whenever raised — unpaid is owed. A charge settled by a run
     * payment in this tenancy counts too, because that payment is counted; one
     * marked settled by hand was paid elsewhere and is never billed.
     */
    private static boolean counts(RiderCharge charge, LocalDate since) {
        if (charge.getStatus() == RiderChargeStatus.OPEN) return true;
        return since != null && charge.isSettledByPayment()
                && charge.getSettledOn() != null && !dateOf(charge.getSettledOn()).isBefore(since);
    }

    /** The billing week a charge was raised in; its timestamp only when that is missing. */
    private static LocalDate weekOf(RiderCharge charge) {
        return charge.getPeriodStart() != null ? charge.getPeriodStart() : dateOf(charge.getChargedOn());
    }

    /** Rent for {@code days} days: whole weeks at the plan, the rest per day. */
    static long rent(long plan, long perDay, int days) {
        return (days / 7) * plan + (days % 7) * perDay;
    }

    /** How many days of rent, from the first, {@code paid} covers. */
    static int coveredDays(long plan, long perDay, long paid, int days) {
        if (plan == 0 || perDay == 0) return days;
        long whole = (paid / plan) * 7 + Math.min(6, (paid % plan) / perDay);
        return (int) Math.min(days, whole);
    }

    /** Days from {@code from} to {@code to}, both included; zero when {@code to} is earlier. */
    private static int days(LocalDate from, LocalDate to) {
        return (int) Math.max(0, to.toEpochDay() - from.toEpochDay() + 1);
    }

    private static LocalDate dateOf(Instant instant) {
        return LocalDate.ofInstant(instant, BillingClock.ZONE);
    }
}
