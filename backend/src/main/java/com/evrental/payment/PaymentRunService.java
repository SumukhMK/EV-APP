package com.evrental.payment;

import com.evrental.assignment.AssignmentQuery;
import com.evrental.common.ConflictException;
import com.evrental.common.Money;
import com.evrental.common.NotFoundException;
import com.evrental.common.ValidationException;
import com.evrental.payment.CollectionResponses.Collections;
import com.evrental.payment.CollectionResponses.LastPayment;
import com.evrental.payment.CollectionResponses.LateSummary;
import com.evrental.payment.CollectionResponses.Line;
import com.evrental.payment.CollectionResponses.Payment;
import com.evrental.payment.CollectionResponses.Row;
import com.evrental.payment.CollectionResponses.StaffTotal;
import com.evrental.payment.CollectionResponses.Today;
import com.evrental.rider.PaymentMode;
import com.evrental.rider.Rider;
import com.evrental.rider.RiderRepository;
import com.evrental.rider.RiderStatus;
import com.evrental.user.User;
import com.evrental.user.UserRepository;
import com.evrental.vehicle.Vehicle;
import com.evrental.vehicle.VehicleRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Collections, payments, reversals and the end-of-day count.
 *
 * <p>Every figure comes from {@link RiderAccounts}; this class only lists,
 * records and shapes. A payment is one row naming the rider — nothing is
 * spread across weeks.
 *
 * <p><b>Weekly bills are frozen on read.</b> There is no scheduler: the API
 * runs on Render's free plan and spins down when idle, so a midnight job would
 * land on a sleeping service. Opening Collections freezes the current week's
 * rate for each rider. A week nobody opened is still billed — at the plan rate
 * on the day it is read.
 */
@Service
public class PaymentRunService {

    private static final Logger log = LoggerFactory.getLogger(PaymentRunService.class);

    private static final com.evrental.service.ServiceLiability BILLABLE = com.evrental.service.ServiceLiability.RIDER;

    private final PaymentPeriodRepository periods;
    private final PaymentCollectionRepository collections;
    private final RiderChargeRepository charges;
    private final RiderRepository riders;
    private final VehicleRepository vehicles;
    private final UserRepository users;
    private final AssignmentQuery assignments;
    private final ReceiptNumbers receiptNumbers;
    private final BillingClock clock;
    private final RiderAccounts accounts;
    private final JdbcTemplate jdbc;

    public PaymentRunService(PaymentPeriodRepository periods,
                             PaymentCollectionRepository collections,
                             RiderChargeRepository charges,
                             RiderRepository riders,
                             VehicleRepository vehicles,
                             UserRepository users,
                             AssignmentQuery assignments,
                             ReceiptNumbers receiptNumbers,
                             BillingClock clock,
                             JdbcTemplate jdbc,
                             RiderAccounts accounts) {
        this.periods = periods;
        this.collections = collections;
        this.charges = charges;
        this.riders = riders;
        this.vehicles = vehicles;
        this.users = users;
        this.assignments = assignments;
        this.receiptNumbers = receiptNumbers;
        this.clock = clock;
        this.jdbc = jdbc;
        this.accounts = accounts;
    }

    // -----------------------------------------------------------------------
    // Collections
    // -----------------------------------------------------------------------

    /**
     * Every rider with a bike, plus anyone without one who still owes. Late
     * riders first, the longest-late at the top.
     */
    @Transactional
    public Collections collections(UUID tenantId) {
        LocalDate today = clock.today();
        List<Rider> active = riders.findByStatus(RiderStatus.ACTIVE);
        generate(tenantId, active, today);

        Map<UUID, Rider> all = new LinkedHashMap<>();
        active.forEach(r -> all.put(r.getId(), r));
        riders.findByStatus(RiderStatus.INACTIVE).forEach(r -> all.putIfAbsent(r.getId(), r));

        Map<Rider, RiderAccounts.Account> byRider = new LinkedHashMap<>();
        for (Rider rider : all.values()) {
            RiderAccounts.Account a = accounts.of(rider, today);
            if (rider.getStatus() == RiderStatus.ACTIVE || a.balance() != 0) byRider.put(rider, a);
        }
        Map<UUID, String> names = userNames(byRider.values().stream()
                .map(RiderAccounts.Account::lastPayment).filter(Objects::nonNull)
                .map(PaymentCollection::getCollectedByUserId).toList());

        List<Row> rows = new ArrayList<>();
        byRider.forEach((rider, a) -> rows.add(rowFor(rider, a, names)));
        rows.sort(Comparator.comparingLong(Row::daysLate).reversed()
                .thenComparing(Comparator.comparingLong(Row::owes).reversed())
                .thenComparing(Row::riderName, Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)));

        List<PaymentCollection> todays = between(today, today.plusDays(1));
        return new Collections(today, todays.stream().mapToLong(PaymentCollection::getAmountPaise).sum(),
                (int) todays.stream().filter(p -> !p.isReversal()).count(), rows);
    }

    private Row rowFor(Rider rider, RiderAccounts.Account a, Map<UUID, String> names) {
        PaymentCollection last = a.lastPayment();
        return new Row(rider.getRiderCode(), rider.getName(), rider.getPhone(),
                assignments.currentVehicleIdOf(rider.getId()), rider.getStatus() == RiderStatus.ACTIVE,
                a.balance(), a.owed() > 0 ? a.daysOverdue() : 0,
                a.owed() > 0 && a.daysOverdue() > 0 ? DunningStage.forDays(a.daysOverdue()) : null,
                a.since() == null ? null : a.period().start().plusDays(6), a.weekRent(),
                usualMethod(rider),
                last == null ? null : new LastPayment(last.getAmountPaise(), last.getMethod(),
                        last.getCollectedOn(), names.get(last.getCollectedByUserId())));
    }

    /** The late riders, counted the way the Late filter shows them. */
    @Transactional(readOnly = true)
    public LateSummary late() {
        LocalDate today = clock.today();
        long count = 0, value = 0, partly = 0;
        for (Rider rider : riders.findByStatus(RiderStatus.ACTIVE)) {
            RiderAccounts.Account a = accounts.of(rider, today);
            if (a.owed() == 0 || a.daysOverdue() == 0) continue;
            count++;
            value += a.owed();
            if (a.latePartlyPaid()) partly++;
        }
        return new LateSummary(count, value, partly, count - partly);
    }

    // -----------------------------------------------------------------------
    // A rider's account
    // -----------------------------------------------------------------------

    @Transactional(readOnly = true)
    public CollectionResponses.Account account(String riderCode, UUID viewerId, com.evrental.user.UserRole viewerRole) {
        Rider rider = riders.findByRiderCode(riderCode)
                .orElseThrow(() -> NotFoundException.of("Rider", riderCode));
        LocalDate today = clock.today();
        RiderAccounts.Account a = accounts.of(rider, today);

        Map<UUID, String> names = userNames(a.lines().stream()
                .map(RiderAccounts.Line::payment).filter(Objects::nonNull)
                .map(PaymentCollection::getCollectedByUserId).toList());
        Set<UUID> reversed = a.lines().stream().map(RiderAccounts.Line::payment).filter(Objects::nonNull)
                .map(PaymentCollection::getReversesId).filter(Objects::nonNull).collect(Collectors.toSet());

        java.time.Instant now = clock.now();
        List<Line> lines = new ArrayList<>();
        for (RiderAccounts.Line l : a.lines()) {
            PaymentCollection p = l.payment();
            ReversalPolicy.Verdict verdict = p == null ? null
                    : ReversalPolicy.check(p, reversed.contains(p.getId()), viewerId, viewerRole, now, today);
            String note = l.kind() != RiderAccounts.LineKind.CHARGE ? null
                    : l.charge().getServiceJobId() != null ? "Repair" : "Unpaid when the bike was returned";
            lines.add(new Line(l.kind().name(), l.date(), l.at(), l.amount(), l.balance(),
                    // Locked once the week is over; the current week is still running.
                    l.to(), l.days(), l.to() != null && l.to().isBefore(today), note,
                    p == null ? null : p.getId(), p == null ? null : receiptNoOf(p),
                    p == null ? null : p.getMethod(), p == null ? null : p.getReference(),
                    p == null ? null : names.get(p.getCollectedByUserId()),
                    p == null ? null : p.getReason(), p != null && reversed.contains(p.getId()),
                    verdict != null && verdict.allowed(), verdict == null ? null : verdict.message(),
                    verdict != null && verdict.needsDetailedReason(),
                    p == null ? null : p.getReceiptIssuedAt()));
        }
        java.util.Collections.reverse(lines);

        return new CollectionResponses.Account(rider.getRiderCode(), rider.getName(), rider.getPhone(),
                assignments.currentVehicleIdOf(rider.getId()), rider.getStatus() == RiderStatus.ACTIVE,
                rider.getPlanAmountPaise(), RiderAccounts.perDay(rider.getPlanAmountPaise()),
                rider.getDepositHeldPaise(), usualMethod(rider),
                a.balance(), a.owed() > 0 ? a.daysOverdue() : 0, a.owed() > 0 ? a.lateSince() : null,
                a.owed() > 0 && a.daysOverdue() > 0 ? DunningStage.forDays(a.daysOverdue()) : null,
                a.since(), a.rent(), a.charges(), a.paid(), lines);
    }

    // -----------------------------------------------------------------------
    // Payments and reversals
    // -----------------------------------------------------------------------

    /**
     * Records money taken from a rider, up to what they owe and never more.
     * Less than owed stays owed. There is no paying ahead: a rider who owes
     * nothing cannot pay, and an amount above what is owed is refused.
     *
     * <p>The rider is locked for the length of the transaction, so two
     * payments for one rider are recorded one after the other — the second
     * is checked against what the first left owing, so two staff collecting at
     * once cannot take more than is owed between them. A double tap carrying
     * the same {@code clientKey} finds the first payment instead of saving a
     * second (or being refused because the first paid the rider up).
     */
    @Transactional
    public Payment record(UUID tenantId, UUID userId, RecordPaymentRequest request) {
        if (request.amount() <= 0) {
            throw new ValidationException("amount", "A payment must be more than zero",
                    Map.of("code", "INVALID_PAYMENT_AMOUNT"));
        }
        if (!Money.isWholeRupees(request.amount())) {
            throw new ValidationException("amount", "Enter whole rupees — no paise.",
                    Map.of("code", "INVALID_PAYMENT_AMOUNT"));
        }
        PaymentMethod method = parseMethod(request.method());
        Rider rider = riders.findByRiderCode(request.riderId())
                .orElseThrow(() -> NotFoundException.of("Rider", request.riderId()));
        lock(rider.getId());

        String key = blankToNull(request.clientKey());
        if (key != null) {
            PaymentCollection existing = collections.findByClientKey(key).orElse(null);
            if (existing != null) return paymentOf(existing, rider);
        }

        LocalDate today = clock.today();
        long owedBefore = accounts.of(rider, today).balance();
        if (owedBefore <= 0) {
            throw new ConflictException(rider.getName() + " has no outstanding dues", "amount",
                    Map.of("code", "NO_OUTSTANDING_DUES", "owes", owedBefore));
        }
        if (request.amount() > owedBefore) {
            throw new ValidationException("amount",
                    "That is more than " + rider.getName() + " owes (" + Money.rupees(owedBefore)
                            + "). Advance payments are not taken.",
                    Map.of("code", "PAYMENT_EXCEEDS_DUES", "owes", owedBefore));
        }
        PaymentCollection saved = collections.saveAndFlush(PaymentCollection.payment(
                tenantId, rider.getId(), request.amount(), method, blankToNull(request.reference()), userId,
                key, receiptNumbers.next(tenantId, today.getYear()), owedBefore));
        return paymentOf(saved, rider);
    }

    /**
     * Takes a payment back out with a reason. A new row, the negative of the
     * first — nothing is edited or deleted. Who may, and until when, is
     * {@link ReversalPolicy}: checked here, under the rider's lock.
     */
    @Transactional
    public Payment reverse(UUID userId, com.evrental.user.UserRole role, UUID paymentId, ReversePaymentRequest request) {
        PaymentCollection payment = collections.findById(paymentId)
                .orElseThrow(() -> NotFoundException.of("Payment", paymentId));
        Rider rider = riders.findById(payment.getRiderId())
                .orElseThrow(() -> NotFoundException.of("Rider", payment.getRiderId()));
        lock(rider.getId());
        ReversalPolicy.Verdict verdict = ReversalPolicy.check(payment,
                collections.findByReversesId(paymentId).isPresent(), userId, role, clock.now(), clock.today());
        if (!verdict.allowed()) {
            throw new ConflictException(verdict.message(), null, Map.of("code", verdict.code()));
        }
        if (verdict.needsDetailedReason() && request.reason().trim().length() < ReversalPolicy.DETAILED_REASON_MIN) {
            throw new ValidationException("reason",
                    "This payment is more than 7 days old. Say what happened, in at least "
                            + ReversalPolicy.DETAILED_REASON_MIN + " characters.",
                    Map.of("code", "REASON_TOO_SHORT"));
        }
        long owedBefore = accounts.of(rider, clock.today()).balance();
        PaymentCollection saved = collections.saveAndFlush(
                PaymentCollection.reversal(payment, userId, request.reason().trim(), owedBefore));
        return paymentOf(saved, rider);
    }

    /** The receipt was printed. The first print is kept; a reprint changes nothing. */
    @Transactional
    public void markReceiptIssued(UUID paymentId) {
        PaymentCollection p = collections.findById(paymentId)
                .orElseThrow(() -> NotFoundException.of("Payment", paymentId));
        p.markReceiptIssued(clock.now());
    }

    /** One payment or reversal: the receipt. */
    @Transactional(readOnly = true)
    public Payment payment(UUID paymentId) {
        PaymentCollection p = collections.findById(paymentId)
                .orElseThrow(() -> NotFoundException.of("Payment", paymentId));
        Rider rider = riders.findById(p.getRiderId()).orElseThrow(() -> NotFoundException.of("Rider", p.getRiderId()));
        return paymentOf(p, rider);
    }

    /** One day's payments and reversals, totalled by who took the money and how. */
    @Transactional(readOnly = true)
    public Today today(LocalDate date) {
        return received(date, date);
    }

    /** The longest range one request may ask for: a year, so a typo cannot pull every payment ever. */
    static final int MAX_RANGE_DAYS = 366;

    /**
     * Payments and reversals taken from {@code from} to {@code to}, both days
     * included, as Indian calendar days. Filtered in the database.
     */
    @Transactional(readOnly = true)
    public Today received(LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new ValidationException("to", "The end date cannot be before the start date",
                    Map.of("code", "INVALID_DATE_RANGE"));
        }
        if (java.time.temporal.ChronoUnit.DAYS.between(from, to) >= MAX_RANGE_DAYS) {
            throw new ValidationException("to", "Pick a range of a year or less",
                    Map.of("code", "INVALID_DATE_RANGE"));
        }
        List<PaymentCollection> day = between(from, to.plusDays(1));
        Map<UUID, PaymentCollection> originals = new HashMap<>();
        collections.findAllById(day.stream().map(PaymentCollection::getReversesId).filter(Objects::nonNull).toList())
                .forEach(o -> originals.put(o.getId(), o));
        List<UUID> people = new ArrayList<>(day.stream().map(PaymentCollection::getCollectedByUserId).toList());
        originals.values().forEach(o -> people.add(o.getCollectedByUserId()));
        Map<UUID, String> names = userNames(people);
        Map<UUID, Rider> ridersById = new HashMap<>();
        riders.findAllById(day.stream().map(PaymentCollection::getRiderId).distinct().toList())
                .forEach(r -> ridersById.put(r.getId(), r));

        Map<String, long[]> staff = new LinkedHashMap<>(); // count, cash, upi, bank
        List<Payment> payments = new ArrayList<>();
        for (PaymentCollection p : day) {
            String by = names.getOrDefault(p.getCollectedByUserId(), "Unknown");
            // A reversal comes off the totals of whoever took the original money.
            PaymentCollection original = p.isReversal() ? originals.get(p.getReversesId()) : null;
            String owner = original == null ? by : names.getOrDefault(original.getCollectedByUserId(), "Unknown");
            long[] t = staff.computeIfAbsent(owner, k -> new long[4]);
            if (!p.isReversal()) t[0]++;
            switch (p.getMethod()) {
                case CASH -> t[1] += p.getAmountPaise();
                case UPI -> t[2] += p.getAmountPaise();
                case BANK_TRANSFER -> t[3] += p.getAmountPaise();
            }
            payments.add(paymentOf(p, ridersById.get(p.getRiderId()), by));
        }
        List<StaffTotal> byStaff = staff.entrySet().stream()
                .map(e -> new StaffTotal(e.getKey(), (int) e.getValue()[0], e.getValue()[1], e.getValue()[2],
                        e.getValue()[3], e.getValue()[1] + e.getValue()[2] + e.getValue()[3]))
                .toList();
        return new Today(to, from, to, day.stream().mapToLong(PaymentCollection::getAmountPaise).sum(),
                (int) day.stream().filter(p -> !p.isReversal()).count(), byStaff, payments);
    }

    private Payment paymentOf(PaymentCollection p, Rider rider) {
        return paymentOf(p, rider, userName(p.getCollectedByUserId()));
    }

    private Payment paymentOf(PaymentCollection p, Rider rider, String by) {
        boolean reversed = !p.isReversal() && collections.findByReversesId(p.getId()).isPresent();
        return new Payment(p.getId(), receiptNoOf(p),
                rider == null ? null : rider.getRiderCode(), rider == null ? null : rider.getName(),
                rider == null ? null : assignments.currentVehicleIdOf(rider.getId()),
                p.getAmountPaise(), p.getMethod(), p.getReference(), p.getCollectedOn(), by,
                p.getOwedBeforePaise(), p.getOwedAfterPaise(), p.getReversesId(), p.getReason(), reversed);
    }

    /** Payments before V022 shared their week's receipt number. */
    private String receiptNoOf(PaymentCollection p) {
        if (p.getReceiptNo() != null || p.getPeriodId() == null) return p.getReceiptNo();
        return periods.findById(p.getPeriodId()).map(PaymentPeriod::getReceiptNo).orElse(null);
    }

    private List<PaymentCollection> between(LocalDate from, LocalDate to) {
        return collections.findByCollectedOnGreaterThanEqualAndCollectedOnLessThanOrderByCollectedOnDesc(
                from.atStartOfDay(BillingClock.ZONE).toInstant(), to.atStartOfDay(BillingClock.ZONE).toInstant());
    }

    /** One payment at a time per rider, until this transaction ends. */
    private void lock(UUID riderId) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtext(?))", riderId.toString());
    }

    private static PaymentMethod usualMethod(Rider rider) {
        PaymentMode mode = rider.getPaymentMode();
        return mode == null ? PaymentMethod.UPI : PaymentMethod.valueOf(mode.name());
    }

    private Map<UUID, String> userNames(Collection<UUID> ids) {
        Map<UUID, String> out = new HashMap<>();
        List<UUID> wanted = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (!wanted.isEmpty()) users.findAllById(wanted).forEach(u -> out.put(u.getId(), u.getName()));
        return out;
    }

    private String userName(UUID id) {
        return id == null ? null : users.findById(id).map(User::getName).orElse(null);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** A 422 naming the field, not Jackson's 400. */
    private PaymentMethod parseMethod(String method) {
        try {
            return PaymentMethod.valueOf(method.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ValidationException("method", "Payment method must be UPI, CASH or BANK_TRANSFER");
        }
    }

    // -----------------------------------------------------------------------
    // Freezing the week's rate
    // -----------------------------------------------------------------------

    /**
     * Writes each rider's current-week row once, freezing the rate.
     *
     * <p>Every insert is {@code ON CONFLICT DO NOTHING} against
     * {@code idx_pp_rider_period}, so two people opening Collections in the
     * same second produce one row, not two.
     */
    private void generate(UUID tenantId, List<Rider> active, LocalDate today) {
        if (active.isEmpty()) return;
        Map<UUID, BillingPeriod> billing = new HashMap<>();
        for (Rider rider : active) {
            LocalDate since = assignments.billingStartedOn(rider.getId()).orElse(null);
            if (since != null) billing.put(rider.getId(), BillingPeriod.current(rider.getBillingDay(), since, today));
        }
        if (billing.isEmpty()) return;
        List<PaymentPeriod> existing = periods.findByRiderIdInAndPeriodStartInOrderByRiderIdAsc(
                billing.keySet(), billing.values().stream().map(BillingPeriod::start).distinct().toList());
        Set<String> alreadyBilled = existing.stream()
                .map(p -> p.getRiderId() + ":" + p.getPeriodStart()).collect(Collectors.toSet());
        int written = 0;
        for (Rider rider : active) {
            BillingPeriod period = billing.get(rider.getId());
            // No bike, or a week that has not begun yet: nothing to freeze.
            if (period == null || period.end().isBefore(period.start())
                    || alreadyBilled.contains(rider.getId() + ":" + period.start())) {
                continue;
            }
            written += insert(freeze(tenantId, rider, period, today));
        }
        if (written > 0) log.info("Froze {} weekly bills", written);
    }

    /** A full week bills the plan exactly; a part week is prorated per day. */
    private PaymentPeriod freeze(UUID tenantId, Rider rider, BillingPeriod period, LocalDate today) {
        long plan = rider.getPlanAmountPaise();
        long perDay = RiderAccounts.perDay(plan);

        LocalDate usedFrom = assignments.billingStartedOn(rider.getId()).orElse(rider.getOnboardedOn());
        int daysBilled = usedFrom.isAfter(period.end()) ? 0
                : Math.toIntExact(period.end().toEpochDay() - Math.max(usedFrom.toEpochDay(), period.start().toEpochDay()) + 1);
        String currentRegistryId = assignments.currentVehicleIdOf(rider.getId());
        UUID vehicleId = currentRegistryId == null ? null
                : vehicles.findByRegistryId(currentRegistryId).map(Vehicle::getId).orElse(null);
        if (plan == 0) daysBilled = 0;

        long billed = RiderAccounts.rent(plan, perDay, daysBilled);
        long serviceCharges = charges.sumOpenInPeriod(rider.getId(), period.start(), BILLABLE);
        long arrears = charges.sumOpenBefore(rider.getId(), period.start(), BILLABLE);

        PaymentPeriod row = new PaymentPeriod();
        row.setTenantId(tenantId);
        row.setRiderId(rider.getId());
        row.setPeriodStart(period.start());
        row.setPeriodEnd(period.end());
        row.setBillingDay(rider.getBillingDay());
        row.setVehicleId(vehicleId);
        row.setPlanAmountPaise(plan);
        row.setDaysBilled(daysBilled);
        row.setPerDayAmountPaise(perDay);
        row.setBilledAmountPaise(billed);
        row.setServiceChargesPaise(serviceCharges);
        row.setArrearsPaise(arrears);
        row.setTotalDuePaise(billed + serviceCharges + arrears);
        row.recomputeStatus(today);
        return row;
    }

    /** JDBC for {@code ON CONFLICT DO NOTHING}, which JPA cannot say. */
    private int insert(PaymentPeriod row) {
        return jdbc.update("""
                INSERT INTO payment_periods (
                    tenant_id, rider_id, period_start, period_end, billing_day, vehicle_id,
                    plan_amount_paise, days_billed, per_day_amount_paise, billed_amount_paise,
                    service_charges_paise, arrears_paise, total_due_paise, amount_paid_paise, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                ON CONFLICT (tenant_id, rider_id, period_start) DO NOTHING
                """,
                row.getTenantId(), row.getRiderId(), row.getPeriodStart(), row.getPeriodEnd(),
                row.getBillingDay().name(), row.getVehicleId(),
                row.getPlanAmountPaise(), row.getDaysBilled(), row.getPerDayAmountPaise(),
                row.getBilledAmountPaise(), row.getServiceChargesPaise(), row.getArrearsPaise(),
                row.getTotalDuePaise(), row.getStatus().name());
    }
}
