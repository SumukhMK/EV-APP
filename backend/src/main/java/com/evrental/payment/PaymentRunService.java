package com.evrental.payment;

import com.evrental.common.ConflictException;
import com.evrental.common.NotFoundException;
import com.evrental.common.ValidationException;
import com.evrental.assignment.AssignmentQuery;
import com.evrental.rider.BillingDay;
import com.evrental.rider.Rider;
import com.evrental.rider.RiderRepository;
import com.evrental.rider.RiderStatus;
import com.evrental.service.ServiceLiability;
import com.evrental.vehicle.Vehicle;
import com.evrental.vehicle.VehicleRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The weekly payment run, collections, receipts and the overdue list.
 *
 * <p>The second half of S6, and the one sentence that explains the shape of
 * all of it: <b>the snapshot freezes what is owed, collections record what came
 * in, and status is a function of the two.</b> The mock derives every screen
 * from the riders on each read, which means raising a rider's weekly plan
 * silently rewrites a receipt printed six weeks ago. Acceptable for a fixture;
 * not for money.
 *
 * <p><b>Generation happens on read.</b> There is no scheduler: the API runs on
 * Render's free plan and spins down after roughly fifteen minutes idle, so a
 * job firing at 00:00 on Monday would land on a sleeping service and quietly
 * not run — observed on 2026-09-28, when a health check timed out at 90s while
 * the service woke. Moving to Starter would make a scheduler an option; it is
 * not one today. The cost of the trade is stated plainly: a period nobody
 * opens does not exist yet.
 */
@Service
public class PaymentRunService {

    private static final Logger log = LoggerFactory.getLogger(PaymentRunService.class);

    /** Only RIDER liability is ever billed; a DEPOSIT charge is drawn from what is held. */
    private static final ServiceLiability BILLABLE = ServiceLiability.RIDER;

    private final PaymentPeriodRepository periods;
    private final PaymentCollectionRepository collections;
    private final RiderChargeRepository charges;
    private final RiderRepository riders;
    private final VehicleRepository vehicles;
    private final AssignmentQuery assignments;
    private final ReceiptNumbers receiptNumbers;
    private final BillingClock clock;
    private final RiderAccounts accounts;

    /**
     * Days past the end of a week before a rider is chased.
     *
     * <p>Three is this operator's rule, not a fact about fleets, so it is
     * configuration rather than a constant. It decides one thing — whether a
     * row is flagged on the run and the overdue list — and deliberately does
     * not touch {@link DunningStage}, whose 7/14/21 ladder is a separate
     * escalation the screens already use.
     */
    private final int graceDays;
    private final JdbcTemplate jdbc;

    public PaymentRunService(PaymentPeriodRepository periods,
                             PaymentCollectionRepository collections,
                             RiderChargeRepository charges,
                             RiderRepository riders,
                             VehicleRepository vehicles,
                             AssignmentQuery assignments,
                             ReceiptNumbers receiptNumbers,
                             BillingClock clock,
                             JdbcTemplate jdbc,
                             RiderAccounts accounts,
                              @org.springframework.beans.factory.annotation.Value("${app.payment.grace-days:3}") int graceDays) {
        this.periods = periods;
        this.collections = collections;
        this.charges = charges;
        this.riders = riders;
        this.vehicles = vehicles;
        this.assignments = assignments;
        this.receiptNumbers = receiptNumbers;
        this.clock = clock;
        this.graceDays = graceDays;
        this.jdbc = jdbc;
        this.accounts = accounts;
    }

    // -----------------------------------------------------------------------
    // The run (screen 15)
    // -----------------------------------------------------------------------

    /**
     * This week's run for one cycle, generating the rows if nobody has yet.
     *
     * <p>No {@code periodStart} parameter, because the frontend contract's
     * {@code getCurrentPaymentRun} has none: "current" is the most recent
     * occurrence of the billing day on or before today. Older periods are
     * reachable through the rider history panel that already exists.
     */
    @Transactional
    public PaymentRunResponse currentRun(UUID tenantId) {
        LocalDate today = clock.today();
        List<Rider> active = riders.findByStatus(RiderStatus.ACTIVE).stream()
                .sorted(Comparator.comparing(Rider::getId)).toList();
        Map<UUID, RiderAccounts.Account> byRider = new LinkedHashMap<>();
        Map<UUID, BillingPeriod> billing = new LinkedHashMap<>();
        for (Rider rider : active) {
            RiderAccounts.Account account = accounts.of(rider, today);
            byRider.put(rider.getId(), account);
            billing.put(rider.getId(), account.period());
        }
        // The weekly rows are still written: collections are recorded against them.
        generate(tenantId, active, billing, today);

        List<PaymentPeriodRowResponse> body = new ArrayList<>();
        for (Rider rider : active) {
            body.add(rowFor(rider, byRider.get(rider.getId())));
        }
        body.sort(Comparator.comparing(PaymentPeriodRowResponse::riderName,
                Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)));

        LocalDate start = billing.values().stream().map(BillingPeriod::start).min(LocalDate::compareTo).orElse(today);
        LocalDate end = billing.values().stream().map(BillingPeriod::end).max(LocalDate::compareTo).orElse(today);
        return new PaymentRunResponse(start, end, body);
    }

    /**
     * One rider's line: this period's rent and repairs, what was carried in,
     * and what has been paid since the period opened. The same account backs
     * the receipt, the overdue list, the register and the dashboard.
     */
    /** The plan this week was billed at; a plan changed since applies from next week. */
    private long frozenPlan(Rider rider, RiderAccounts.Account a) {
        return periods.findByRiderIdAndPeriodStart(rider.getId(), a.period().start())
                .map(PaymentPeriod::getPlanAmountPaise).orElse(rider.getPlanAmountPaise());
    }

    private PaymentPeriodRowResponse rowFor(Rider rider, RiderAccounts.Account a) {
        return new PaymentPeriodRowResponse(
                rider.getRiderCode(), rider.getName(), assignments.currentVehicleIdOf(rider.getId()),
                rider.getBillingDay(), frozenPlan(rider, a), a.periodDays(), a.perDay(),
                a.periodRent(), a.periodCharges(), a.carried(), a.totalDue(), a.periodPaid(), a.balance(),
                a.status(), a.daysOverdue(), a.owed() > 0 && a.daysOverdue() > graceDays);
    }

    /**
     * Writes the missing rows for a period, once.
     *
     * <p>Every insert is {@code ON CONFLICT DO NOTHING} against
     * {@code idx_pp_rider_period}, so two people opening this screen in the
     * same second produce one set of rows rather than two bills. The
     * pre-check below is only there to skip the arithmetic for riders who
     * already have a row; the index is the actual guarantee.
     */
    private void generate(UUID tenantId, List<Rider> cycle, Map<UUID, BillingPeriod> billing, LocalDate today) {
        if (cycle.isEmpty()) {
            return;
        }

        List<UUID> riderIds = cycle.stream().map(Rider::getId).toList();
        List<LocalDate> starts = cycle.stream().map(r -> billing.get(r.getId()).start()).distinct().toList();
        List<PaymentPeriod> existing = periods.findByRiderIdInAndPeriodStartInOrderByRiderIdAsc(riderIds, starts);
        Set<String> alreadyBilled = existing.stream()
                .map(p -> p.getRiderId() + ":" + p.getPeriodStart()).collect(Collectors.toSet());
        // Charges raised after a row was frozen (or while it was being frozen) are picked up here.
        existing.forEach(row -> row.refreshCharges(
                charges.sumOpenInPeriod(row.getRiderId(), row.getPeriodStart(), BILLABLE),
                charges.sumOpenBefore(row.getRiderId(), row.getPeriodStart(), BILLABLE),
                today));
        int written = 0;
        for (Rider rider : cycle) {
            BillingPeriod period = billing.get(rider.getId());
            // A week that has not begun yet (a bike starting tomorrow) has nothing to bill.
            if (period.end().isBefore(period.start()) || alreadyBilled.contains(rider.getId() + ":" + period.start())) {
                continue;
            }
            written += insert(freeze(tenantId, rider, period, today));
        }
        if (written > 0) {
            log.info("Generated {} payment period rows across individual billing days", written);
        }
    }

    /**
     * The calculation, done once and then never again for this row.
     *
     * <p>Three rules live here and all three are easy to get wrong:
     *
     * <ul>
     *   <li><b>A full week bills the plan exactly.</b>
     *       {@code round(199900 / 7) * 7} is ₹1,999.05, not ₹1,999. The mock
     *       carries that drift; the designed rows on artboard 15 do not. So
     *       seven days bills {@code planAmount} and proration applies only
     *       below seven — otherwise every rider is quietly overcharged four
     *       paise a week, forever.</li>
     *   <li><b>DEPOSIT charges never reach a run.</b> They are settled against
     *       the deposit, not billed; the contract says so outright.</li>
     *   <li><b>A rider with no plan still gets a row</b>, billing nothing. A
     *       run that silently omits people is how somebody stops being billed
     *       by accident.</li>
     * </ul>
     */
    private PaymentPeriod freeze(UUID tenantId, Rider rider, BillingPeriod period, LocalDate today) {
        long plan = rider.getPlanAmountPaise();
        long perDay = Math.round(plan / 7.0);

        LocalDate usedFrom = assignments.billingStartedOn(rider.getId()).orElse(rider.getOnboardedOn());
        int daysBilled = usedFrom.isAfter(period.end()) ? 0
                : Math.toIntExact(period.end().toEpochDay() - Math.max(usedFrom.toEpochDay(), period.start().toEpochDay()) + 1);
        String currentRegistryId = assignments.currentVehicleIdOf(rider.getId());
        UUID vehicleId = currentRegistryId == null ? null
                : vehicles.findByRegistryId(currentRegistryId).map(Vehicle::getId).orElse(null);

        // No plan, nothing to bill. The row still exists, and reads zero.
        if (plan == 0) {
            daysBilled = 0;
        }

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

    /**
     * Inserted through JDBC rather than JPA for one reason: {@code ON CONFLICT
     * DO NOTHING}. JPA has no way to express it, and the alternative — catch
     * the constraint violation — aborts the surrounding transaction in
     * Postgres, taking every other rider in the run down with it.
     *
     * @return 1 if this call wrote the row, 0 if another one got there first
     */
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

    // -----------------------------------------------------------------------
    // Overdue (screen 17)
    // -----------------------------------------------------------------------

    /**
     * Every active rider with rent unpaid past the end of its week, worst
     * first — one line per rider, read off the same account as the run.
     */
    @Transactional(readOnly = true)
    public List<OverdueRiderResponse> overdue() {
        LocalDate today = clock.today();
        List<OverdueRiderResponse> out = new ArrayList<>();
        for (Rider rider : riders.findByStatus(RiderStatus.ACTIVE)) {
            RiderAccounts.Account a = accounts.of(rider, today);
            if (a.owed() == 0 || a.daysOverdue() == 0) continue;
            out.add(new OverdueRiderResponse(
                    rider.getRiderCode(), rider.getName(), rider.getPhone(),
                    assignments.currentVehicleIdOf(rider.getId()),
                    a.daysOverdue(), a.owed(), DunningStage.forDays(a.daysOverdue()),
                    a.daysOverdue() > graceDays));
        }
        out.sort(Comparator.comparingLong(OverdueRiderResponse::daysOverdue).reversed());
        return out;
    }

    // -----------------------------------------------------------------------
    // Receipts (screen 16)
    // -----------------------------------------------------------------------

    /**
     * One rider's receipt for the current period.
     *
     * <p>Null when the rider has no line in this period — the screen turns
     * that into "no line in this period" rather than inventing one. An unknown
     * rider is a 404, which is a different answer to a different question.
     *
     * <p>The receipt restates the run row; it does not recompute it. Both read
     * the same frozen columns, so the total on the run and the total on the
     * receipt cannot disagree.
     */
    @Transactional(readOnly = true)
    public PaymentReceiptResponse receiptFor(UUID riderId) {
        Rider rider = riders.findById(riderId)
                .orElseThrow(() -> NotFoundException.of("Rider", riderId));
        RiderAccounts.Account a = accounts.of(rider, clock.today());

        PaymentPeriod period = periods.findByRiderIdAndPeriodStart(riderId, a.period().start()).orElse(null);
        if (period == null) {
            return null;
        }
        PaymentCollection latest = collections.findByRiderId(riderId).stream()
                .max(Comparator.comparing(PaymentCollection::getCollectedOn)).orElse(null);

        // Payments clear the oldest week first, so the latest one may sit on an
        // earlier week than this: its receipt number is the one to print.
        String receiptNo = latest == null ? period.getReceiptNo()
                : periods.findById(latest.getPeriodId()).map(PaymentPeriod::getReceiptNo).orElse(period.getReceiptNo());
        return new PaymentReceiptResponse(
                receiptNo, rider.getRiderCode(), rider.getName(),
                assignments.currentVehicleIdOf(riderId),
                a.period().start(), a.period().end(), rider.getBillingDay(),
                period.getPlanAmountPaise(), a.periodDays(), a.perDay(),
                a.periodRent(), a.periodCharges(), a.carried(), a.totalDue(), a.periodPaid(), a.balance(),
                a.status(),
                latest == null ? null : latest.getMethod(),
                latest == null ? null : latest.getCollectedOn(),
                latest == null ? null : latest.getReference());
    }

    // -----------------------------------------------------------------------
    // Collections
    // -----------------------------------------------------------------------

    /**
     * Records money taken at the counter against the rider's current period.
     *
     * <p>Append-only: the collection is a new row, and {@code amount_paid} is
     * recomputed as {@code SUM(payment_collections)} rather than incremented,
     * so two people recording cash at the same counter cannot lose one of the
     * two payments. The period is locked for the length of this transaction to
     * make that sum stable.
     *
     * <p>Overpayment is accepted on purpose. The contract documents
     * {@code balance} as "positive means still owed", which already
     * anticipates a negative; riders pay ahead, and refusing the money at the
     * counter is worse than carrying a credit.
     */
    @Transactional
    public PaymentPeriodRowResponse record(UUID tenantId, UUID userId, RecordPaymentRequest request) {
        if (request.amount() <= 0) {
            throw new ValidationException("amount", "A payment must be more than zero");
        }
        PaymentMethod method = parseMethod(request.method());

        Rider rider = riders.findByRiderCode(request.riderId())
                .orElseThrow(() -> NotFoundException.of("Rider", request.riderId()));

        LocalDate today = clock.today();
        RiderAccounts.Account account = accounts.of(rider, today);
        // The account, not the stored weeks, decides: weeks nobody opened the
        // run for have no row, and their rent is still owed.
        if (account.owed() == 0) {
            throw new ConflictException(rider.getName() + " has no outstanding balance", "riderId");
        }
        LocalDate currentStart = account.period().start();
        if (periods.findByRiderIdAndPeriodStart(rider.getId(), currentStart).isEmpty()) {
            insert(freeze(tenantId, rider, account.period(), today));
        }

        // Oldest short week first; whatever is left lands on the current week,
        // which may then read overpaid — that is the credit, carried forward.
        List<LocalDate> targets = new ArrayList<>(periods.findByRiderIdOrderByPeriodStartDesc(rider.getId()).stream()
                .filter(p -> p.balancePaise() > 0 && !p.getPeriodStart().equals(currentStart))
                .map(PaymentPeriod::getPeriodStart)
                .sorted()
                .toList());
        targets.add(currentStart);
        long remaining = request.amount();
        for (LocalDate periodStart : targets) {
            if (remaining <= 0) break;
            PaymentPeriod period = periods.findForUpdate(rider.getId(), periodStart).orElseThrow();
            boolean last = periodStart.equals(currentStart);
            long applied = last ? remaining : Math.min(remaining, period.balancePaise());
            if (applied <= 0) continue;
            collections.saveAndFlush(new PaymentCollection(
                    tenantId, period.getId(), applied, method, request.reference(), userId));
            period.applyCollected(collections.sumForPeriod(period.getId()), today);
            if (period.getReceiptNo() == null) {
                period.assignReceiptNo(receiptNumbers.next(tenantId, today.getYear()));
            }
            if (period.getStatus() == PaymentStatus.PAID) {
                charges.findOpenUpTo(rider.getId(), period.getPeriodStart(), BILLABLE)
                        .forEach(charge -> charge.settleByPayment(java.time.Instant.now()));
            }
            periods.save(period);
            remaining -= applied;
        }
        return rowFor(rider, accounts.of(rider, today));
    }

    /**
     * A 422 naming the field, not Jackson's 400.
     *
     * <p>{@code method} arrives as a String precisely so this can happen: an
     * unrecognised value is a rule this module states, and every other rule in
     * it answers 422 with the field attached.
     */
    private PaymentMethod parseMethod(String method) {
        try {
            return PaymentMethod.valueOf(method.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ValidationException("method", "Payment method must be UPI, CASH or BANK_TRANSFER");
        }
    }

    // -----------------------------------------------------------------------
    // The rider profile's history panel (screen 08)
    // -----------------------------------------------------------------------

    /**
     * One rider's own ledger, newest week first.
     *
     * <p>Thinner than a run row on purpose: the run is where the calculation
     * is argued about; this only has to answer "was this week settled, and
     * how". {@code method} is the most recent collection's, and null while
     * nothing has been collected.
     */
    @Transactional
    public List<RiderPaymentRow> historyFor(UUID riderId) {
        riders.findById(riderId).orElseThrow(() -> NotFoundException.of("Rider", riderId));

        List<PaymentPeriod> rows = periods.findByRiderIdOrderByPeriodStartDesc(riderId);
        if (rows.isEmpty()) {
            return List.of();
        }
        LocalDate today = clock.today();
        rows.forEach(row -> row.recomputeStatus(today));

        // One query for every week's collections, not one per week. Newest
        // first, so the first entry seen for a period is the one to show.
        Map<UUID, PaymentMethod> latestMethod = new HashMap<>();
        collections.findByPeriodIdInOrderByCollectedOnDesc(rows.stream().map(PaymentPeriod::getId).toList())
                .forEach(c -> latestMethod.putIfAbsent(c.getPeriodId(), c.getMethod()));

        List<RiderPaymentRow> out = new ArrayList<>(rows.size());
        for (PaymentPeriod row : rows) {
            out.add(new RiderPaymentRow(
                    row.getId(),
                    row.getPeriodStart(),
                    row.getPeriodEnd(),
                    row.getTotalDuePaise(),
                    row.getAmountPaidPaise(),
                    row.getStatus(),
                    latestMethod.get(row.getId())));
        }
        return out;
    }
}
