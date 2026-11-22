package com.evrental.payment;

import com.evrental.assignment.AssignmentQuery;
import com.evrental.rider.Rider;
import com.evrental.service.ServiceLiability;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * What a rider owes — worked out here and nowhere else.
 *
 * <pre>
 *   owes = rent + repairs and other charges − payments
 * </pre>
 *
 * Every money screen reads this: Collections, the late list, the rider's
 * account timeline, receipts, the register, the dashboard and the deboard
 * form. A payment is one row naming the rider; which weeks it covers is worked
 * out here (oldest first) and never stored.
 *
 * <p><b>Rent</b> runs from the first billed week of the rider's current
 * tenancy (their unbroken run of bikes, {@link AssignmentQuery#billingStartedOn})
 * to today. A billed week uses its frozen amount; days with no billed week use
 * the plan rate, so no day goes unbilled.
 *
 * <p><b>Charges</b>: rider-liable charges still open, whenever raised, plus
 * ones a payment settled in this window (before V022 a payment could settle a
 * charge). A charge settled by hand was paid elsewhere and is never billed.
 *
 * <p><b>Payments</b> count from the start of the tenancy — or, for a rider
 * who has handed their bike back, from the day their unpaid rent was raised as
 * a charge, so paying that off counts.
 */
@Component
public class RiderAccounts {

    private static final ServiceLiability BILLABLE = ServiceLiability.RIDER;

    private final AssignmentQuery assignments;
    private final RiderChargeRepository charges;
    private final PaymentPeriodRepository periods;
    private final PaymentCollectionRepository collections;

    public RiderAccounts(AssignmentQuery assignments, RiderChargeRepository charges,
                         PaymentPeriodRepository periods, PaymentCollectionRepository collections) {
        this.assignments = assignments;
        this.charges = charges;
        this.periods = periods;
        this.collections = collections;
    }

    public enum LineKind { RENT, CHARGE, PAYMENT, REVERSAL }

    /**
     * One line of the account, oldest first.
     *
     * @param amount  positive adds to what is owed (rent, a charge, a reversal), negative takes off (a payment)
     * @param balance what was owed right after this line
     * @param to      last day a rent line covers; null for the others
     * @param payment the payment row, for payment and reversal lines
     * @param charge  the charge row, for charge lines
     */
    public record Line(LocalDate date, Instant at, LineKind kind, long amount, long balance,
                       LocalDate to, int days, boolean billed, PaymentCollection payment, RiderCharge charge) {}

    /**
     * One rider's account as of {@code today}.
     *
     * @param since       first day of rent; null when the rider holds no bike
     * @param period      the rider's current billing week
     * @param weekRent    rent for the current billing week so far
     * @param daysOverdue days since the end of the oldest week whose rent is not covered
     * @param lateSince   the last day of that week; null when nothing is late
     */
    public record Account(
            LocalDate since,
            BillingPeriod period,
            long rent,
            long charges,
            long paid,
            long weekRent,
            long daysOverdue,
            LocalDate lateSince,
            boolean latePartlyPaid,
            PaymentCollection lastPayment,
            List<Line> lines) {

        /** Positive is owed; negative is credit. */
        public long balance() {
            return rent + charges - paid;
        }

        public long owed() {
            return Math.max(0, balance());
        }

        public PaymentStatus status() {
            if (owed() == 0) return PaymentStatus.PAID;
            if (daysOverdue > 0) return PaymentStatus.OVERDUE;
            if (lastPayment != null && !dateOf(lastPayment.getCollectedOn()).isBefore(period.start())) {
                return PaymentStatus.PARTIAL;
            }
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

        List<PaymentPeriod> rows = since == null ? List.of() : rows(rider, since, today);
        List<Segment> segments = since == null ? List.of() : segments(rows, since, period, today, plan, perDay);

        List<RiderCharge> billable = charges.findByRiderIdOrderByChargedOnDesc(rider.getId()).stream()
                .filter(c -> c.getLiability() == BILLABLE)
                .toList();
        LocalDate paymentsFrom = paymentsFrom(since, billable,
                since == null ? assignments.lastReturnedOn(rider.getId()).orElse(null) : null);
        List<RiderCharge> counted = billable.stream().filter(c -> counts(c, paymentsFrom)).toList();

        Set<UUID> tenancyRows = new HashSet<>();
        rows.forEach(r -> tenancyRows.add(r.getId()));
        List<PaymentCollection> payments = paymentsFrom == null ? List.of()
                : collections.findByRiderIdOrderByCollectedOnAsc(rider.getId()).stream()
                        .filter(p -> !dateOf(p.getCollectedOn()).isBefore(paymentsFrom)
                                || (p.getPeriodId() != null && tenancyRows.contains(p.getPeriodId())))
                        .toList();

        long rent = segments.stream().mapToLong(Segment::rent).sum();
        long weekRent = segments.stream().filter(s -> !s.start().isBefore(period.start())).mapToLong(Segment::rent).sum();
        long chargeTotal = counted.stream().mapToLong(RiderCharge::getAmountPaise).sum();
        long paid = payments.stream().mapToLong(PaymentCollection::getAmountPaise).sum();

        Late late = late(segments, paid, rider, plan, perDay, today);
        PaymentCollection lastPayment = payments.stream()
                .filter(p -> !p.isReversal())
                .filter(p -> payments.stream().noneMatch(r -> p.getId().equals(r.getReversesId())))
                .reduce((a, b) -> b).orElse(null);

        return new Account(since, period, rent, chargeTotal, paid, weekRent, late.days(), late.weekEnd(),
                late.partlyPaid(), lastPayment,
                lines(weekly(segments, rider.getBillingDay(), plan, perDay), counted, payments));
    }

    // -----------------------------------------------------------------------
    // Rent
    // -----------------------------------------------------------------------

    /**
     * A stretch of the tenancy and its rent: a billed week (frozen amount) or
     * days no week covers (plan rate).
     */
    record Segment(LocalDate start, LocalDate end, long rent, int days, boolean billed) {}

    private List<PaymentPeriod> rows(Rider rider, LocalDate since, LocalDate today) {
        return periods.findByRiderIdOrderByPeriodStartDesc(rider.getId()).stream()
                .filter(p -> !p.getPeriodEnd().isBefore(since) && !p.getPeriodStart().isAfter(today))
                .sorted(Comparator.comparing(PaymentPeriod::getPeriodStart))
                .toList();
    }

    /**
     * The tenancy from the first billed week to today, in order. Gaps are
     * split at the current period's start so this week's rent reads on its own.
     *
     * <p>Rent before the first billed week predates this system and is taken
     * as settled outside it. shortcut: assumes that; replace with an explicit
     * opening balance per rider at go-live if it stops being true.
     */
    private static List<Segment> segments(List<PaymentPeriod> rows, LocalDate since, BillingPeriod period,
                                          LocalDate today, long plan, long perDay) {
        LocalDate rentFrom = rows.isEmpty() ? period.start() : rows.get(0).getPeriodStart();
        if (rentFrom.isBefore(since)) rentFrom = since;

        List<Segment> out = new ArrayList<>();
        LocalDate cursor = rentFrom;
        for (PaymentPeriod row : rows) {
            if (row.getPeriodStart().isAfter(cursor)) {
                gap(out, cursor, row.getPeriodStart().minusDays(1), period.start(), plan, perDay);
            }
            out.add(new Segment(row.getPeriodStart(), row.getPeriodEnd(), row.getBilledAmountPaise(),
                    row.getDaysBilled(), true));
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
        out.add(new Segment(from, to, rent(plan, perDay, n), plan == 0 ? 0 : n, false));
    }

    private record Late(long days, LocalDate weekEnd, boolean partlyPaid) {}

    /**
     * Pays rent oldest first and finds the first week not covered. A billed
     * week ends where its row says; days without a row end with their
     * billing week.
     */
    private static Late late(List<Segment> segments, long paid, Rider rider, long plan, long perDay,
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
            long days = Math.max(0, today.toEpochDay() - weekEnd.toEpochDay());
            return days == 0 ? new Late(0, null, false) : new Late(days, weekEnd, remaining > 0);
        }
        return new Late(0, null, false);
    }

    // -----------------------------------------------------------------------
    // Charges and payments
    // -----------------------------------------------------------------------

    /**
     * Where payments start counting: the tenancy's first day (for a rider with
     * no bike, the day it came back), or earlier when unpaid rent from a
     * returned bike is still open — payments after that charge was raised
     * are paying it.
     */
    private static LocalDate paymentsFrom(LocalDate since, List<RiderCharge> billable, LocalDate returnedOn) {
        LocalDate settlement = billable.stream()
                .filter(c -> c.getStatus() == RiderChargeStatus.OPEN && c.getServiceJobId() == null)
                .map(c -> dateOf(c.getChargedOn()))
                .min(LocalDate::compareTo).orElse(null);
        // No bike: whatever they pay from the day it came back is paying off
        // what is still open — repairs, and the unpaid rent once it is raised.
        LocalDate start = since != null ? since : returnedOn;
        if (start == null) return settlement;
        if (settlement == null) return start;
        return settlement.isBefore(start) ? settlement : start;
    }

    private static boolean counts(RiderCharge charge, LocalDate paymentsFrom) {
        if (charge.getStatus() == RiderChargeStatus.OPEN) return true;
        return paymentsFrom != null && charge.isSettledByPayment()
                && charge.getSettledOn() != null && !dateOf(charge.getSettledOn()).isBefore(paymentsFrom);
    }

    // -----------------------------------------------------------------------
    // The timeline
    // -----------------------------------------------------------------------

    /**
     * The rent split into one line per billing week, for reading: a long run of
     * unbilled days becomes a line a week, and a week frozen part-way plus the
     * days after it become one line. Totals are unchanged.
     */
    static List<Segment> weekly(List<Segment> segments, com.evrental.rider.BillingDay day, long plan, long perDay) {
        List<Segment> pieces = new ArrayList<>();
        for (Segment s : segments) {
            if (s.billed()) {
                pieces.add(s);
                continue;
            }
            LocalDate from = s.start();
            long rentLeft = s.rent();
            while (!from.isAfter(s.end())) {
                LocalDate weekEnd = BillingPeriod.endOnOrAfter(day, from.plusDays(1)).minusDays(1);
                LocalDate to = weekEnd.isBefore(s.end()) ? weekEnd : s.end();
                int n = days(from, to);
                long r = to.equals(s.end()) ? rentLeft : rent(plan, perDay, n);
                pieces.add(new Segment(from, to, r, plan == 0 ? 0 : n, false));
                rentLeft -= r;
                from = to.plusDays(1);
            }
        }
        List<Segment> out = new ArrayList<>();
        for (Segment s : pieces) {
            Segment prev = out.isEmpty() ? null : out.get(out.size() - 1);
            if (prev != null && s.start().equals(prev.end().plusDays(1))
                    && BillingPeriod.endOnOrAfter(day, prev.start().plusDays(1))
                            .equals(BillingPeriod.endOnOrAfter(day, s.start().plusDays(1)))) {
                out.set(out.size() - 1, new Segment(prev.start(), s.end(), prev.rent() + s.rent(),
                        prev.days() + s.days(), prev.billed() && s.billed()));
            } else {
                out.add(s);
            }
        }
        return out;
    }

    private static List<Line> lines(List<Segment> segments, List<RiderCharge> counted, List<PaymentCollection> payments) {
        record Item(LocalDate date, Instant at, int order, LineKind kind, long amount, Segment seg,
                    PaymentCollection payment, RiderCharge charge) {}
        List<Item> items = new ArrayList<>();
        for (Segment s : segments) {
            items.add(new Item(s.start(), s.start().atStartOfDay(BillingClock.ZONE).toInstant(), 0,
                    LineKind.RENT, s.rent(), s, null, null));
        }
        for (RiderCharge c : counted) {
            items.add(new Item(dateOf(c.getChargedOn()), c.getChargedOn(), 1, LineKind.CHARGE,
                    c.getAmountPaise(), null, null, c));
        }
        for (PaymentCollection p : payments) {
            items.add(new Item(dateOf(p.getCollectedOn()), p.getCollectedOn(), 2,
                    p.isReversal() ? LineKind.REVERSAL : LineKind.PAYMENT, -p.getAmountPaise(), null, p, null));
        }
        items.sort(Comparator.comparing(Item::date).thenComparing(Item::order).thenComparing(Item::at));

        List<Line> out = new ArrayList<>(items.size());
        long balance = 0;
        for (Item i : items) {
            balance += i.amount();
            Segment s = i.seg();
            out.add(new Line(i.date(), i.at(), i.kind(), i.amount(), balance,
                    s == null ? null : s.end(), s == null ? 0 : s.days(), s != null && s.billed(),
                    i.payment(), i.charge()));
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // Arithmetic
    // -----------------------------------------------------------------------

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

    static LocalDate dateOf(Instant instant) {
        return LocalDate.ofInstant(instant, BillingClock.ZONE);
    }
}
